# app.py
import os
import json
import random
from datetime import datetime
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, jsonify, make_response, session, g, abort, flash
from models import db, Client, Brief, User, Role, Function, Department, FunctionDepartmentLink
from fpdf import FPDF
from dotenv import load_dotenv

# Загружаем переменные окружения из .env.local
load_dotenv('.env.local')

# -------------------------------------------------------------------
# Настройка приложения
# -------------------------------------------------------------------
app = Flask(__name__)

# Подключение к базе данных Supabase
database_url = os.environ.get('DATABASE_URL')
if database_url:
    # Supabase передаёт URL начиная с postgres://, SQLAlchemy требует postgresql://
    database_url = database_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
else:
    # Локальное разработка — SQLite
    basedir = os.path.abspath(os.path.dirname(__file__))
    db_path = os.path.join(basedir, 'instance', 'app.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + db_path

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = os.environ.get('SECRET_KEY', 'shef-dev-secret-key-change-in-prod')
db.init_app(app)

# -------------------------------------------------------------------
# Инициализация БД и сидинг начальных данных
# -------------------------------------------------------------------

_FUNCTIONS_SEED = [
    'Техническая',
    'Коммерческая',
    'Финансовая',
    'Управление рисками',
    'Учетная',
    'Административная',
    'Управление инновациями',
    'Управление данными',
    'Устойчивое развитие (ESG)',
]

def seed_functions():
    """Заполнить фиксированный набор функций (идемпотентно)."""
    for i, name in enumerate(_FUNCTIONS_SEED, start=1):
        if not Function.query.filter_by(name=name).first():
            db.session.add(Function(name=name, sort_order=i))
    db.session.commit()

def compute_function_health(func):
    """Вычислить health функции из 4 бинарных сигналов → проценты по 25."""
    signals = [
        bool(func.description and func.description.strip()),
        func.executor_link is not None,
        len(func.consumer_links) > 0,
        len(func.supplier_links) > 0,
    ]
    return round(sum(signals) / len(signals) * 100)

def compute_department_health(dept):
    """Вычислить health отдела из 3 бинарных сигналов → проценты по ~33."""
    signals = [
        bool(dept.description and dept.description.strip()),
        len(dept.executor_links) > 0,
        len(dept.consumer_links) > 0 or len(dept.supplier_links) > 0,
    ]
    return round(sum(signals) / len(signals) * 100)

def health_label_and_class(health):
    """Преобразовать процент health в label и CSS-класс (по аналогии с client health)."""
    if health == 100:
        return 'Хорошее', 'up'
    elif health >= 67:
        return 'В порядке', 'up'
    elif health >= 33:
        return 'В работе', 'warn'
    elif health > 0:
        return 'Внимание', 'down'
    else:
        return 'Нет данных', 'flat'

def health_spark_color_and_state(health):
    """Преобразовать процент health в цвет спарка и состояние (по аналогии с client health)."""
    if health >= 70:
        return '#16A34A', 'Хорошее состояние'
    elif health >= 45:
        return '#C2740B', 'Требует внимания'
    elif health > 0:
        return '#DC2626', 'Зона риска'
    else:
        return '#BFC0C7', 'Нет данных'

with app.app_context():
    try:
        db.create_all()
        seed_functions()
    except Exception as e:
        print(f"Warning: Could not create tables or seed data: {e}")
        # Приложение продолжит работать даже если БД недоступна

# -------------------------------------------------------------------
# Загрузка текущего пользователя и контекст-процессоры
# -------------------------------------------------------------------

@app.before_request
def load_logged_in_user():
    """Загрузить текущего пользователя из сессии."""
    if request.endpoint and request.endpoint == 'static':
        return
    user_id = session.get('user_id')
    g.user = User.query.get(user_id) if user_id else None

@app.context_processor
def inject_current_user():
    """Сделать текущего пользователя доступным в шаблонах."""
    return dict(current_user=getattr(g, 'user', None))

@app.context_processor
def inject_nav():
    """Счётчик клиентов для бейджа в сайдбаре."""
    try:
        return dict(nav_client_count=Client.query.count())
    except Exception:
        return dict(nav_client_count=0)

# -------------------------------------------------------------------
# Декораторы для защиты маршрутов
# -------------------------------------------------------------------

def login_required(view):
    """Требовать авторизацию."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            return redirect(url_for('login', next=request.path))
        return view(*args, **kwargs)
    return wrapped

def founder_required(view):
    """Требовать авторизацию как Founder."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            return redirect(url_for('login', next=request.path))
        if not g.user.is_founder:
            abort(403)
        return view(*args, **kwargs)
    return wrapped

# -------------------------------------------------------------------
# Вспомогательные функции для структуры анкет
# -------------------------------------------------------------------
def get_brief_questions(brief_type):
    """Возвращает словарь с заголовками и полями анкеты по её типу."""
    questions = {
        'briefing': {
            'title': 'Брифинг "Бизнес-портрет"',
            'sections': [
                {'title': 'Раздел 1. Общая информация о бизнесе',
                 'fields': ['Название компании', 'ОПФ', 'Год начала деятельности',
                            'Вид деятельности (ОКВЭД)', 'География работы', 'Стадия жизненного цикла']},
                {'title': 'Раздел 2. Продукты и услуги',
                 'fields': ['Товарные группы', 'Доля в выручке (%)', 'Сезонность',
                            'Средняя себестоимость', 'Частота обновления ассортимента',
                            'Продукт-локомотив']},
                {'title': 'Раздел 3. Клиенты и рынок (субъективная картина)',
                 'fields': ['Портрет идеального клиента', 'Клиентские сегменты',
                            'Количество активных клиентов', 'Средний чек',
                            'Каналы привлечения', 'Частота повторных покупок',
                            'Длительность сделки', 'Эффективные каналы']},
                {'title': 'Раздел 4. Финансовые показатели',
                 'fields': ['Среднемесячная выручка', 'Чистая прибыль/EBITDA',
                            'Доля постоянных расходов', 'Кассовые разрывы',
                            'Финансовая подушка', 'Дебиторская задолженность',
                            'Кредиты/займы', 'Управленческий учет']},
                {'title': 'Раздел 5. Команда и оргструктура',
                 'fields': ['Количество сотрудников', 'Ключевые роли',
                            'Точка замыкания задач', 'Организационная схема',
                            'Текучесть персонала', 'Лояльность команды']},
                {'title': 'Раздел 6. Операционные процессы и ИТ',
                 'fields': ['Описание бизнес-процесса', 'Используемое ПО',
                            'Интеграции', 'Хранение данных', 'Неудобства в ИТ',
                            'Регламенты']},
                {'title': 'Раздел 7. Маркетинг и продажи',
                 'fields': ['Бюджет на маркетинг', 'Платные каналы', 'Конверсия',
                            'Бренд-бук', 'Обратная связь', 'Программа лояльности']},
                {'title': 'Раздел 8. Конкуренты и позиционирование',
                 'fields': ['Основные конкуренты', 'Конкурентные преимущества',
                            'Слабые стороны', 'Причины выбора клиентами',
                            'Случаи ухода клиентов']},
                {'title': 'Раздел 9. Цели, ожидания и ограничения',
                 'fields': ['Главная проблема', 'Ожидаемый результат',
                            'Бюджет на изменения', 'Сотрудники под риском',
                            'Юридические ограничения']},
                {'title': 'Раздел 10. Дополнительно',
                 'fields': ['Дополнительная информация', 'Ссылки на ресурсы']}
            ]
        },
        'point_a': {
            'title': 'Точка А: Боль, Цели и Ресурсы',
            'sections': [
                {'title': 'Блок 1. БОЛЬ — что сейчас работает хуже всего',
                 'fields': ['Три главные проблемы', 'Случаи потерь денег/клиентов',
                            'Что отнимает личное время', 'Невозможность делегирования',
                            'Что "починить" в первую очередь', 'Где работаете "на склад"']},
                {'title': 'Блок 2. ЦЕЛИ — зачем проводится аудит',
                 'fields': ['Управленческая задача', 'Критерии успешности аудита',
                            'Идеальный бизнес через год', 'Предыдущие попытки',
                            'Категорически неприемлемые решения']},
                {'title': 'Блок 3. РЕСУРСЫ — чем располагает бизнес',
                 'fields': ['Финансовые ресурсы', 'Человеческие ресурсы',
                            'Материальные/нематериальные активы', 'Временной ресурс',
                            'Личностный ресурс собственника']},
                {'title': 'Блок 4. ДАННЫЕ О СЕГМЕНТЕ РЫНКА И ОТРАСЛИ',
                 'fields': ['Идеальный клиент и причина выбора', 'Главные конкуренты',
                            'Изменения на рынке за год', 'Влияние законов/технологий',
                            'Объем рынка', 'Тренды рынка']}
            ]
        },
        'docs': {
            'title': 'Документация бизнеса',
            'sections': [
                {'title': '1. Организационная схема',
                 'fields': ['Наличие схемы', 'Описание иерархии']},
                {'title': '2. Ключевые процессы "как есть"',
                 'fields': ['Шаги основного БП', 'Ответственные',
                            'Время выполнения', 'Где ошибки/задержки']},
                {'title': '3. Финансовая отчётность',
                 'fields': ['ОПиУ за 3-6 мес.', 'ДДС за 3-6 мес']},
                {'title': '4. Данные о клиентах и заявках',
                 'fields': ['Выгрузка из CRM/Excel', 'Воронка продаж']},
                {'title': '5. Должностные инструкции',
                 'fields': ['Наличие инструкций', 'Описание функционала']},
                {'title': '6. Договоры с контрагентами',
                 'fields': ['Условия договоров', 'Ограничения']},
                {'title': '7. Скрипты продаж и шаблоны',
                 'fields': ['Наличие скриптов', 'Примеры диалогов']}
            ]
        },
        'sales': {
            'title': 'Брифинг "Продажи"',
            'type': 'sales',
            'metrics': [
                {'id': '1.1', 'question': 'Фактическая выручка по продажам услуг за последний квартал', 'inputs': [{'label': 'Выручка текущий период (тыс. руб.)', 'hint': 'Данные из учётной системы', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'Выручка прошлый период (тыс. руб.)', 'hint': 'Данные за аналогичный период года назад', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': '((Текущ − Прошл) / Прошл) × 100%', 'calc_type': 'growth_percent', 'responsible': 'Руководитель отдела продаж', 'health_threshold': 5, 'health_comparison': 'gte', 'health_note': 'Год-к-году рост ≥ 5%'},
                {'id': '1.2', 'question': 'Процент выполнения квартального плана по выручке', 'inputs': [{'label': 'Факт (тыс. руб.)', 'hint': 'Текущая выручка', 'type': 'number'}, {'label': 'План (тыс. руб.)', 'hint': 'Плановая выручка', 'type': 'number'}], 'formula': '(Факт / План) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель отдела продаж', 'health_threshold': 95, 'health_comparison': 'gte', 'health_note': 'Выполнение плана ≥ 95%'},
                {'id': '1.3', 'question': 'Количество активных клиентов за последние 12 месяцев', 'inputs': [{'label': 'Активные клиенты (текущий год)', 'hint': 'Уникальные клиенты из CRM', 'type': 'number', 'unit': 'чел.'}, {'label': 'Активные клиенты (прошлый год)', 'hint': 'Количество клиентов год назад', 'type': 'number', 'unit': 'чел.'}], 'formula': '((Текущ − Прошл) / Прошл) × 100%', 'calc_type': 'growth_percent', 'responsible': 'Руководитель отдела продаж', 'health_threshold': 0, 'health_comparison': 'gte', 'health_note': 'Прирост клиентов ≥ 0% (год-к-году)'},
                {'id': '1.4', 'question': 'Коэффициент удержания клиентов (Retention Rate) за год', 'inputs': [{'label': 'Клиенты прошлого года', 'hint': 'Количество клиентов год назад', 'type': 'number'}, {'label': 'Клиенты в текущем году', 'hint': 'Сколько из них вернулось', 'type': 'number'}], 'formula': '(Текущие / Прошлые)', 'calc_type': 'division_reverse', 'responsible': 'Руководитель отдела продаж', 'health_threshold': 0.80, 'health_comparison': 'gte', 'health_note': 'Retention ≥ 0.80 (80%)'},
                {'id': '1.5', 'question': 'Коэффициент конверсии «Лид → SQL» за квартал', 'inputs': [{'label': 'Лидов получено', 'hint': 'Входящие заявки из всех каналов', 'type': 'number'}, {'label': 'Квалифицировано (SQL)', 'hint': 'Лиды, прошедшие квалификацию', 'type': 'number'}], 'formula': '(SQL / Лиды) × 100%', 'calc_type': 'division_percent_reverse', 'responsible': 'Руководитель отдела продаж', 'health_threshold': 12, 'health_comparison': 'gte', 'health_note': 'Конверсия ≥ 12%'},
                {'id': '1.6', 'question': 'Коэффициент конверсии «SQL → Договор» за квартал', 'inputs': [{'label': 'SQL получено', 'hint': 'Квалифицированные лиды', 'type': 'number'}, {'label': 'Сделок закрыто', 'hint': 'Подписанные договоры', 'type': 'number'}], 'formula': '(Сделки / SQL) × 100%', 'calc_type': 'division_percent_reverse', 'responsible': 'Руководитель отдела продаж', 'health_threshold': 20, 'health_comparison': 'gte', 'health_note': 'Конверсия ≥ 20%'},
                {'id': '1.7', 'question': 'Средняя длительность цикла продаж за квартал', 'inputs': [{'label': 'Дата первого контакта', 'hint': 'Дата первого действия продавца', 'type': 'date'}, {'label': 'Дата закрытия сделки', 'hint': 'Дата подписания договора', 'type': 'date'}], 'formula': 'Дата2 − Дата1 (дней)', 'calc_type': 'date_diff', 'responsible': 'Руководитель отдела продаж', 'health_threshold': 60, 'health_comparison': 'lte', 'health_note': 'Цикл продаж ≤ 60 дней'},
                {'id': '1.8', 'question': 'Доля выручки от 5 крупнейших клиентов', 'inputs': [{'label': 'Выручка от Топ-5', 'hint': 'Сумма доходов от 5 главных клиентов', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'Общая выручка', 'hint': 'Вся выручка за период', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': '(Топ-5 / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель отдела продаж', 'health_threshold': 40, 'health_comparison': 'lte', 'health_note': 'Доля ≤ 40% (диверсификация)'},
                {'id': '1.9', 'question': 'Наличие утверждённого регламента квалификации лидов', 'inputs': [{'label': 'Регламент', 'hint': 'Да / Нет', 'type': 'yesno'}], 'formula': 'Документ утверждён', 'calc_type': 'yesno', 'responsible': 'Руководитель отдела продаж', 'health_threshold': 'yes', 'health_comparison': 'eq', 'health_note': 'Регламент должен быть утверждён (Да)'},
                {'id': '1.10', 'question': 'Дата последней актуализации коммерческих предложений', 'inputs': [{'label': 'Дата последней редакции', 'hint': 'Дата утверждения актуальных КП', 'type': 'date'}], 'formula': 'Дата актуальности', 'calc_type': 'date_age', 'responsible': 'Руководитель отдела продаж', 'health_threshold': 6, 'health_comparison': 'date_months', 'health_note': 'КП не старше 6 месяцев'},
                {'id': '1.11', 'question': 'Процент менеджеров, выполнивших план продаж в квартале', 'inputs': [{'label': 'Менеджеров выполнили план', 'hint': 'Факт ≥ Квота', 'type': 'number'}, {'label': 'Всего менеджеров', 'hint': 'Общее количество менеджеров', 'type': 'number'}], 'formula': '(Успешных / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель отдела продаж', 'health_threshold': 60, 'health_comparison': 'gte', 'health_note': 'Процент успеха ≥ 60%'},
                {'id': '1.12', 'question': 'NPS по послепродажному обслуживанию (за 6 мес.)', 'inputs': [{'label': 'Промоутеры (%)', 'hint': 'Оценка 9–10 баллов', 'type': 'number'}, {'label': 'Критики (%)', 'hint': 'Оценка 0–6 баллов', 'type': 'number'}], 'formula': 'Промоутеры − Критики', 'calc_type': 'subtraction', 'responsible': 'Руководитель отдела продаж', 'health_threshold': 50, 'health_comparison': 'gt', 'health_note': 'NPS > 50 (отличное обслуживание)'},
            ],
            'responsible_list': ['Руководитель отдела продаж', 'Менеджер по продажам', 'Другое']
        }
    }
    return questions.get(brief_type, {})

# -------------------------------------------------------------------
# Маршруты (роуты) приложения
# -------------------------------------------------------------------

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Вход в приложение."""
    if g.user is not None:
        return redirect(url_for('home'))

    if request.method == 'POST':
        email = request.form.get('email', '').lower().strip()
        password = request.form.get('password', '')
        error = None

        if not email:
            error = 'Email обязателен'
        elif not password:
            error = 'Пароль обязателен'
        else:
            user = User.query.filter_by(email=email).first()
            if user is None:
                error = 'Пользователь не найден'
            elif not user.is_active:
                error = 'Аккаунт деактивирован'
            elif not user.check_password(password):
                error = 'Неверный пароль'

        if error is None:
            session['user_id'] = user.id
            session.modified = True
            next_page = request.args.get('next', url_for('home'))
            return redirect(next_page)

        return render_template('login.html', error=error)

    return render_template('login.html')

@app.route('/logout', methods=['POST'])
def logout():
    """Выход из приложения."""
    session.clear()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def home():
    """Главная — сводка ШЕФ, focus-list, pulse."""
    palette = ['#1D1D1F','#2563EB','#16A34A','#7C3AED','#0891B2','#DB2777','#EA580C']

    clients = Client.query.order_by(Client.created_at.desc()).all()

    # Приветствие по времени суток
    hour = datetime.now().hour
    if hour < 5:    greet = 'Доброй ночи'
    elif hour < 12: greet = 'Доброе утро'
    elif hour < 18: greet = 'Добрый день'
    else:           greet = 'Добрый вечер'

    # Дата по-русски
    months   = ['января','февраля','марта','апреля','мая','июня',
                'июля','августа','сентября','октября','ноября','декабря']
    weekdays = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье']
    now = datetime.now()
    date_str = f"{weekdays[now.weekday()]}, {now.day} {months[now.month - 1]}"

    # Агрегаты по брифам
    client_count      = len(clients)
    total_briefs_done = 0
    focus_items       = []
    resume_items      = []

    for client in clients:
        briefs_map = {b.brief_type: b for b in client.briefs}
        done = sum(1 for b in briefs_map.values() if b.status == 'Заполнено')
        total_briefs_done += done

        parts    = client.name.split()
        initials = (parts[0][0] + (parts[1][0] if len(parts) > 1 else '')).upper()
        color    = palette[client.id % len(palette)]

        # В фокусе: клиенты с незавершёнными брифами
        if done < 3:
            focus_items.append({
                'client':   client,
                'done':     done,
                'total':    3,
                'initials': initials,
                'color':    color,
            })

        # Для блока «Продолжить» — последний изменённый бриф
        last_brief = None
        for b in client.briefs:
            if b.updated_at and (last_brief is None or b.updated_at > last_brief.updated_at):
                last_brief = b
        if last_brief and last_brief.updated_at:
            resume_items.append({
                'client':   client,
                'snip':     f'Анкета «{last_brief.brief_type}» — статус: {last_brief.status}',
                'updated':  last_brief.updated_at,
                'initials': initials,
                'color':    color,
            })

    # Focus: сначала с наименьшим числом заполненных → топ-3
    focus_items.sort(key=lambda x: x['done'])
    focus_items = focus_items[:3]

    # Resume: последние 3 по дате изменения
    resume_items.sort(key=lambda x: x['updated'], reverse=True)
    resume_items = resume_items[:3]

    avg_health = round(total_briefs_done / max(client_count * 3, 1) * 100)

    return render_template('home.html',
        greet=greet,
        date_str=date_str,
        client_count=client_count,
        total_briefs_done=total_briefs_done,
        total_briefs=client_count * 3,
        avg_health=avg_health,
        focus_items=focus_items,
        resume_items=resume_items,
    )


@app.route('/clients')
@login_required
def clients():
    """Картотека клиентов — с агрегированными данными для UI."""
    palette = ['#1D1D1F','#2563EB','#16A34A','#7C3AED','#0891B2','#DB2777','#EA580C']

    def brief_state(b):
        if b is None: return 'none'
        if b.status == 'Заполнено': return 'done'
        if b.status == 'В работе': return 'work'
        return 'none'

    raw = Client.query.order_by(Client.created_at.desc()).all()
    total_briefs_done = 0
    client_data = []

    for c in raw:
        bmap = {b.brief_type: b for b in c.briefs}
        done = sum(1 for b in bmap.values() if b.status == 'Заполнено')
        total_briefs_done += done

        parts    = c.name.split()
        initials = (parts[0][0] + (parts[1][0] if len(parts) > 1 else '')).upper()
        color    = palette[c.id % len(palette)]
        health   = round(done / 3 * 100)

        if health == 100:   health_label, health_cls = 'Хорошее',   'up'
        elif health >= 67:  health_label, health_cls = 'В порядке', 'up'
        elif health >= 33:  health_label, health_cls = 'В работе',  'warn'
        elif done > 0:      health_label, health_cls = 'Внимание',  'down'
        else:               health_label, health_cls = 'Нет данных','flat'

        # stroke-dasharray для SVG-кольца: r=18 → C ≈ 113.1
        circ = 113.1
        filled  = round(health / 100 * circ, 1)
        empty   = round(circ - filled, 1)

        client_data.append(dict(
            id=c.id, name=c.name,
            created_at=c.created_at,
            initials=initials, color=color,
            done=done, total=3,
            health=health,
            health_label=health_label, health_cls=health_cls,
            ring_filled=filled, ring_empty=empty,
            bd_briefing=brief_state(bmap.get('briefing')),
            bd_point_a=brief_state(bmap.get('point_a')),
            bd_docs=brief_state(bmap.get('docs')),
        ))

    total_count    = len(raw)
    avg_health     = round(total_briefs_done / max(total_count * 3, 1) * 100)
    clients_active = sum(1 for c in client_data if c['done'] > 0)

    return render_template('index.html',
        clients=client_data,
        total_count=total_count,
        clients_active=clients_active,
        total_briefs_done=total_briefs_done,
        total_briefs=total_count * 3,
        avg_health=avg_health,
    )

@app.route('/add_client', methods=['GET', 'POST'])
@login_required
def add_client():
    """Добавление нового клиента."""
    if request.method == 'POST':
        name = request.form['name']
        client = Client(name=name)
        db.session.add(client)
        db.session.commit()
        return redirect(url_for('clients'))
    return render_template('client_form.html')

@app.route('/client/<int:client_id>/brief/add', methods=['GET', 'POST'])
@login_required
def add_brief(client_id):
    """Добавление нового брифа к клиенту."""
    client = Client.query.get_or_404(client_id)

    # Список доступных типов брифов
    available_briefs = [
        {'key': 'sales', 'name': 'Продажи', 'desc': '12 ключевых метрик по продажам и их Health показатели'},
        {'key': 'briefing', 'name': 'Бизнес-портрет', 'desc': 'Основная анкета для сбора информации о бизнесе'},
        {'key': 'point_a', 'name': 'Точка А', 'desc': 'Боль, цели и ресурсы компании'},
        {'key': 'docs', 'name': 'Документация', 'desc': 'Организационная структура и процессы'},
    ]

    if request.method == 'POST':
        brief_type = request.form.get('brief_type', 'sales')

        brief = Brief(
            brief_type=brief_type,
            status='Не заполнено',
            client_id=client_id
        )
        db.session.add(brief)
        db.session.commit()

        return redirect(url_for('client_briefs', client_id=client_id))

    return render_template('add_brief.html', client=client, available_briefs=available_briefs)

@app.route('/brief/<int:brief_id>/delete', methods=['POST'])
@login_required
def delete_brief(brief_id):
    """Удаление брифа."""
    brief = Brief.query.get_or_404(brief_id)
    client_id = brief.client_id

    db.session.delete(brief)
    db.session.commit()

    return redirect(url_for('client_briefs', client_id=client_id))

@app.route('/client/<int:client_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_client(client_id):
    """Редактирование имени клиента."""
    client = Client.query.get_or_404(client_id)
    if request.method == 'POST':
        client.name = request.form['name']
        db.session.commit()
        return redirect(url_for('clients'))
    return render_template('client_form.html', client=client, edit_mode=True)

@app.route('/client/<int:client_id>/delete', methods=['POST'])
@login_required
def delete_client(client_id):
    """Удаление клиента и всех его анкет."""
    client = Client.query.get_or_404(client_id)
    db.session.delete(client)
    db.session.commit()
    return redirect(url_for('clients'))

@app.route('/client/<int:client_id>')
@login_required
def client_briefs(client_id):
    """Детальная карточка клиента с вкладками (Обзор, Брифы, …)."""
    client = Client.query.get_or_404(client_id)
    palette = ['#1D1D1F','#2563EB','#16A34A','#7C3AED','#0891B2','#DB2777','#EA580C']

    # Получаем реальные брифы из БД (без создания жестко закодированных)
    briefs_from_db = Brief.query.filter_by(client_id=client.id).all()

    done = sum(1 for b in briefs_from_db if b.status == 'Заполнено')
    total = len(briefs_from_db) if briefs_from_db else 1

    parts    = client.name.split()
    initials = (parts[0][0] + (parts[1][0] if len(parts) > 1 else '')).upper()
    color    = palette[client.id % len(palette)]
    health   = round(done / total * 100)

    if health == 100:   health_label, health_cls = 'Хорошее',   'up'
    elif health >= 67:  health_label, health_cls = 'В порядке', 'up'
    elif health >= 33:  health_label, health_cls = 'В работе',  'warn'
    elif done > 0:      health_label, health_cls = 'Внимание',  'down'
    else:               health_label, health_cls = 'Нет данных','flat'

    if health >= 70:    spark_color, health_state = '#16A34A', 'Хорошее состояние'
    elif health >= 45:  spark_color, health_state = '#C2740B', 'Требует внимания'
    elif health > 0:    spark_color, health_state = '#DC2626', 'Зона риска'
    else:               spark_color, health_state = '#BFC0C7', 'Нет данных'

    circ = 113.1
    ring_filled = round(health / 100 * circ, 1)
    ring_empty  = round(circ - ring_filled, 1)

    # Список брифов из БД для вкладки «Брифы»
    briefs_list = []
    for b in briefs_from_db:
        briefs_list.append({
            'type': b.brief_type,
            'name': b.brief_type or f'Бриф #{b.id}',
            'desc': f'Создан {b.created_at.strftime("%d.%m.%Y")}' if b.created_at else 'Только что создан',
            'status': b.status,
            'id': b.id,
            'updated_at': b.updated_at.strftime('%d.%m.%Y %H:%M') if b.updated_at else None,
        })

    # Активность: последние изменения брифов
    events = []
    for b in briefs_from_db:
        if b.updated_at:
            events.append({
                'kind': 'doc',
                'time': b.updated_at.strftime('%d.%m.%Y %H:%M'),
                'text': f'Бриф «{b.brief_type}» — {b.status}',
                'ts': b.updated_at,
            })
    events.sort(key=lambda x: x['ts'], reverse=True)
    activity = events[:5]
    if not activity:
        activity = [{'kind': 'doc', 'time': '—', 'text': 'Активности пока нет'}]

    # Рекомендуемые шаги
    steps = []
    unfilled = [b for b in briefs_from_db if b.status != 'Заполнено']
    if unfilled:
        steps.append({'title': f'Заполнить брифы ({len(unfilled)} не заполнено)',
                      'desc': 'Заполните оставшиеся брифы для полного анализа'})
    if not unfilled:
        steps = [
            {'title': 'Обсудить результаты анализа',
             'desc': 'Все брифы заполнены — ИИ готов сформировать полный план.'},
            {'title': 'Сформировать стратегический план',
             'desc': 'Откройте чат и запросите план действий по клиенту.'},
        ]

    client_data = dict(
        id=client.id, name=client.name,
        created_at=client.created_at,
        initials=initials, color=color,
        done=done, total=total,
        health=health, health_label=health_label, health_cls=health_cls,
        health_state=health_state, spark_color=spark_color,
        ring_filled=ring_filled, ring_empty=ring_empty,
        briefs_list=briefs_list,
        activity=activity,
        steps=steps,
    )
    return render_template('client_detail.html', client=type('C', (), client_data))

@app.route('/brief/<int:brief_id>', methods=['GET', 'POST'])
@login_required
def brief_form(brief_id):
    """Заполнение конкретной анкеты."""
    brief = Brief.query.get_or_404(brief_id)
    questions_data = get_brief_questions(brief.brief_type)

    # Для Sales брифа используем специальный шаблон
    if questions_data.get('type') == 'sales':
        if request.method == 'POST':
            # Собираем метрики из формы
            metrics = {}
            has_data = False

            for metric in questions_data.get('metrics', []):
                metric_id = metric['id']
                input_count = len(metric.get('inputs', []))
                metric_values = []

                # Собираем все значения вводных данных для этого метрика
                for i in range(input_count):
                    value = request.form.get(f"metric_{metric_id}_{i}", '')
                    if value:
                        metric_values.append(value)
                        has_data = True

                # Получаем выбранного ответственного для этого метрика
                responsible = request.form.get(f"responsible_{metric_id}", metric.get('responsible', ''))

                if metric_values or responsible:
                    metrics[metric_id] = {
                        'values': metric_values,
                        'responsible': responsible
                    }

            # Сохраняем как answers JSON
            brief.answers = {
                'metrics': metrics,
                'last_updated': datetime.utcnow().isoformat()
            }

            if has_data:
                brief.status = 'В работе'
            else:
                brief.status = 'Не заполнено'
            db.session.commit()

            # Если нажали «Сохранить и завершить»
            if 'complete' in request.form:
                brief.status = 'Заполнено'
                db.session.commit()
                return redirect(url_for('client_briefs', client_id=brief.client_id))

            return redirect(url_for('brief_form', brief_id=brief.id))

        return render_template('sales_brief.html', brief=brief, brief_data=questions_data)

    # Для остальных типов брифов — обычная логика
    if request.method == 'POST':
        # Собираем все ответы из формы
        answers = {}
        for section in questions_data.get('sections', []):
            for field in section['fields']:
                key = f"{section['title']}||{field}"
                value = request.form.get(key, '')
                if value.strip():
                    answers[key] = value

        brief.answers = answers
        # Автоматически ставим статус
        if answers:
            brief.status = 'В работе'
        else:
            brief.status = 'Не заполнено'
        db.session.commit()

        # Если нажали «Сохранить и завершить»
        if 'complete' in request.form:
            brief.status = 'Заполнено'
            db.session.commit()
            return redirect(url_for('client_briefs', client_id=brief.client_id))

        return redirect(url_for('brief_form', brief_id=brief.id))

    return render_template('brief_form.html', brief=brief, questions=questions_data)

@app.route('/brief/<int:brief_id>/pdf')
@login_required
def generate_pdf(brief_id):
    """Генерация PDF-версии анкеты с сохранением заполненных данных."""
    brief = Brief.query.get_or_404(brief_id)
    questions_data = get_brief_questions(brief.brief_type)
    answers = brief.answers or {}

    pdf = FPDF()
    # --- Настройка шрифтов ---
    font_dir = os.path.join(os.path.dirname(__file__), 'fonts')
    font_regular = os.path.join(font_dir, 'DejaVuSans.ttf')
    font_bold = os.path.join(font_dir, 'DejaVuSans-Bold.ttf')

    if not os.path.exists(font_regular):
        return "Ошибка: шрифт DejaVuSans.ttf не найден в папке fonts.", 500

    pdf.add_font('DejaVu', '', font_regular, uni=True)
    if os.path.exists(font_bold):
        pdf.add_font('DejaVu', 'B', font_bold, uni=True)

    pdf.add_page()
    pdf.set_font('DejaVu', '', 10)

    # Заголовок анкеты
    pdf.set_font_size(14)
    pdf.cell(0, 10, txt=questions_data.get('title', 'Анкета'), ln=True, align='C')
    pdf.ln(5)

    # Статус и клиент
    pdf.set_font_size(10)
    pdf.cell(0, 6, txt=f'Статус: {brief.status}', ln=True)
    pdf.cell(0, 6, txt=f'Клиент: {brief.client.name}', ln=True)
    pdf.ln(10)

    # Перебор всех секций и их полей
    pdf.set_font_size(9)
    for section in questions_data.get('sections', []):
        # Заголовок секции жирным шрифтом (если доступен)
        if os.path.exists(font_bold):
            pdf.set_font('DejaVu', 'B', 10)
        else:
            pdf.set_font('DejaVu', '', 10)
        pdf.cell(0, 8, txt=section['title'], ln=True)
        pdf.set_font('DejaVu', '', 9)
        pdf.ln(2)

        for field in section['fields']:
            key = f"{section['title']}||{field}"
            value = answers.get(key, 'Нет ответа')
            # Название поля жирным
            if os.path.exists(font_bold):
                pdf.set_font('DejaVu', 'B', 9)
            else:
                pdf.set_font('DejaVu', '', 9)
            pdf.cell(0, 6, txt=f'{field}:', ln=True)
            # Значение обычным
            pdf.set_font('DejaVu', '', 9)
            pdf.multi_cell(0, 6, txt=str(value))
            pdf.ln(1)

        pdf.ln(4)

    # Отправляем PDF клиенту
    pdf_output = bytes(pdf.output())
    response = make_response(pdf_output)
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = f'inline; filename=brief_{brief_id}.pdf'
    return response

@app.route('/update_brief_status/<int:brief_id>', methods=['POST'])
@login_required
def update_brief_status(brief_id):
    """Ручное обновление статуса анкеты."""
    brief = Brief.query.get_or_404(brief_id)
    new_status = request.form.get('status')
    if new_status in ['Не заполнено', 'В работе', 'Заполнено']:
        brief.status = new_status
        db.session.commit()
    return redirect(url_for('brief_form', brief_id=brief.id))

@app.route('/brief/<int:brief_id>/autosave', methods=['POST'])
@login_required
def autosave_brief(brief_id):
    """Автосохранение анкеты (без изменения статуса на 'Заполнено')."""
    brief = Brief.query.get_or_404(brief_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data'}), 400

    answers = {}
    for section in data.get('sections', []):
        for field_obj in section.get('fields', []):
            key = f"{section['title']}||{field_obj['name']}"
            value = field_obj.get('value', '')
            if value.strip():
                answers[key] = value

    brief.answers = answers
    # Определяем статус: если все поля заполнены → "Заполнено", иначе "В работе"
    all_fields_filled = True
    for section in get_brief_questions(brief.brief_type).get('sections', []):
        for field in section['fields']:
            key = f"{section['title']}||{field}"
            if not answers.get(key):  # если нет ответа или пустая строка
                all_fields_filled = False
                break
        if not all_fields_filled:
            break

    if all_fields_filled:
        brief.status = 'Заполнено'
    else:
        brief.status = 'В работе'

    db.session.commit()
    return jsonify({'status': 'ok', 'brief_status': brief.status})

# -------------------------------------------------------------------
# Этап 5 — Чаты с ИИ
# -------------------------------------------------------------------

_AI_REPLIES = [
    'Готовлю ответ на основе данных клиентов и заполненных брифов. '
    'Вот что я вижу: ключевые показатели стабильны, но есть зоны роста '
    'в маржинальности и конверсии. Хотите, я разложу это по шагам?',

    'Проанализировал доступные данные. Рекомендую начать с диверсификации '
    'клиентской базы и оптимизации воронки продаж — это даст самый быстрый '
    'эффект на горизонте квартала.',

    'Понял задачу. Я могу подготовить детальный план, собрать отчёт или '
    'открыть нужный раздел. С чего начнём?',

    'Хороший вопрос. Основной риск здесь — концентрация выручки на 2–3 '
    'ключевых клиентах. Если потеряете хотя бы одного, это сразу скажется '
    'на денежном потоке. Предлагаю разработать стратегию удержания.',

    'Для формирования полного плана мне нужны данные из анкет. '
    'Заполните брифы клиента — и я выдам конкретные рекомендации с '
    'приоритетами и сроками.',
]

_CHAT_SUGGESTIONS = [
    {'text': 'Проанализируй бриф клиента',
     'icon_path': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>'},
    {'text': 'Какие риски у бизнеса?',
     'icon_path': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>'},
    {'text': 'Сформируй план действий',
     'icon_path': '<path d="M20 6 9 17l-5-5"/>'},
    {'text': 'Покажи финансовые инсайты',
     'icon_path': '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M3 20h18"/>'},
]


@app.route('/chat')
@login_required
def chat():
    """Чат с ИИ (UI-заглушка, B2)."""
    hour = datetime.now().hour
    if hour < 5:    greet = 'Доброй ночи'
    elif hour < 12: greet = 'Доброе утро'
    elif hour < 18: greet = 'Добрый день'
    else:           greet = 'Добрый вечер'

    messages = session.get('chat_messages', [
        {'role': 'ai',
         'time': '10:00',
         'text': 'Привет, Алексей! Я здесь, чтобы помочь принимать лучшие решения '
                 'и расти быстрее. Что хотите сделать?'},
    ])
    return render_template('chat.html',
        greet=greet,
        messages=messages,
        suggestions=_CHAT_SUGGESTIONS,
    )


@app.route('/chat/send', methods=['POST'])
@login_required
def chat_send():
    """Принимает сообщение пользователя, добавляет в сессию, возвращает мок-ответ ИИ."""
    data = request.get_json()
    if not data or not data.get('text', '').strip():
        return jsonify({'error': 'empty'}), 400

    text = data['text'].strip()
    now = datetime.now().strftime('%H:%M')

    msgs = session.get('chat_messages', [
        {'role': 'ai', 'time': '10:00',
         'text': 'Привет, Алексей! Я здесь, чтобы помочь принимать лучшие решения.'},
    ])
    msgs.append({'role': 'user', 'time': now, 'text': text})
    reply = random.choice(_AI_REPLIES)
    msgs.append({'role': 'ai', 'time': now, 'text': reply})
    # Храним последние 40 сообщений
    session['chat_messages'] = msgs[-40:]
    session.modified = True

    return jsonify({'reply': reply})


# -------------------------------------------------------------------
# Этап 6 — Заглушки разделов
# -------------------------------------------------------------------

_EMPTY_SECTIONS = {
    'analytics': {
        'title': 'Аналитика',
        'subtitle': 'Сквозные показатели, динамика выручки и воронка продаж появятся здесь после заполнения брифов.',
        'icon': '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M3 20h18"/>',
    },
    'tasks': {
        'title': 'Задачи',
        'subtitle': 'Создавайте задачи вручную или дайте ИИ сформировать план действий.',
        'icon': '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    },
    'templates': {
        'title': 'Шаблоны',
        'subtitle': 'Готовые шаблоны анкет, отчётов и стратегических планов появятся здесь.',
        'icon': '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 9h17"/><path d="M9 9v11.5"/>',
    },
    'knowledge': {
        'title': 'База знаний',
        'subtitle': 'Методики, фреймворки и кейсы консалтинга будут доступны здесь.',
        'icon': '<path d="M5 4.5A2 2 0 0 1 7 3h12v15H7a2 2 0 0 0-2 2Z"/><path d="M5 4.5V19a2 2 0 0 0 2 2h12"/>',
    },
    'settings': {
        'title': 'Настройки',
        'subtitle': 'Управляйте профилем, уведомлениями и интеграциями.',
        'icon': '<circle cx="12" cy="12" r="3"/><path d="M19.4 12a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.3 7.3 0 0 0-2-1.2l-.3-2.5H8.3L8 5.7a7.3 7.3 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7.3 7.3 0 0 0 2 1.2l.3 2.5h3.4l.3-2.5a7.3 7.3 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"/>',
    },
}


@app.route('/analytics')
@login_required
def analytics():
    return render_template('empty_section.html', section=_EMPTY_SECTIONS['analytics'])

@app.route('/tasks')
@login_required
def tasks():
    return render_template('empty_section.html', section=_EMPTY_SECTIONS['tasks'])

@app.route('/templates')
@login_required
def templates_view():
    return render_template('empty_section.html', section=_EMPTY_SECTIONS['templates'])

@app.route('/knowledge')
@login_required
def knowledge():
    return render_template('empty_section.html', section=_EMPTY_SECTIONS['knowledge'])

@app.route('/settings')
@login_required
def settings():
    return render_template('empty_section.html', section=_EMPTY_SECTIONS['settings'])


# -------------------------------------------------------------------
# Вкладка "Компания" (организационная структура с матрицей)
# -------------------------------------------------------------------

@app.route('/company')
@founder_required
def company():
    """Матрица: Функции × Отделы."""
    functions = Function.query.order_by(Function.sort_order).all()
    departments = Department.query.order_by(Department.name).all()
    links = FunctionDepartmentLink.query.all()

    # Подготовка данных функций
    functions_data = []
    for func in functions:
        health = compute_function_health(func)
        health_label, health_cls = health_label_and_class(health)
        spark_color, health_state = health_spark_color_and_state(health)
        circ = 113.1
        ring_filled = round(health / 100 * circ, 1)
        ring_empty = round(circ - ring_filled, 1)

        functions_data.append({
            'id': func.id,
            'name': func.name,
            'description': func.description,
            'health': health,
            'health_label': health_label,
            'health_cls': health_cls,
            'spark_color': spark_color,
            'health_state': health_state,
            'ring_filled': ring_filled,
            'ring_empty': ring_empty,
            'initials': func.name[:2].upper(),
            'color': ['#2563EB', '#16A34A', '#7C3AED', '#0891B2', '#DB2777', '#EA580C', '#1D1D1F', '#F59E0B', '#EC4899'][func.id % 9],
        })

    # Подготовка данных отделов
    departments_data = []
    for dept in departments:
        health = compute_department_health(dept)
        health_label, health_cls = health_label_and_class(health)
        spark_color, health_state = health_spark_color_and_state(health)
        circ = 113.1
        ring_filled = round(health / 100 * circ, 1)
        ring_empty = round(circ - ring_filled, 1)

        departments_data.append({
            'id': dept.id,
            'name': dept.name,
            'description': dept.description,
            'health': health,
            'health_label': health_label,
            'health_cls': health_cls,
            'spark_color': spark_color,
            'health_state': health_state,
            'ring_filled': ring_filled,
            'ring_empty': ring_empty,
            'initials': dept.name[:2].upper(),
            'color': ['#2563EB', '#16A34A', '#7C3AED', '#0891B2', '#DB2777', '#EA580C', '#1D1D1F', '#F59E0B', '#EC4899'][dept.id % 9],
        })

    # Матрица связей для шаблона
    matrix = {}
    for link in links:
        key = (link.function_id, link.department_id)
        if key not in matrix:
            matrix[key] = []
        matrix[key].append({
            'relation_type': link.relation_type,
            'description': link.description,
            'id': link.id,
        })

    return render_template('company.html',
                          functions=functions_data,
                          departments=departments_data,
                          matrix=matrix,
                          total_departments=len(departments),
                          total_links=len(links))

@app.route('/company/function/<int:function_id>')
@founder_required
def company_function_detail(function_id):
    """Детали функции с вкладками."""
    func = Function.query.get_or_404(function_id)

    health = compute_function_health(func)
    health_label, health_cls = health_label_and_class(health)
    spark_color, health_state = health_spark_color_and_state(health)
    circ = 113.1
    ring_filled = round(health / 100 * circ, 1)
    ring_empty = round(circ - ring_filled, 1)

    # Подготовка данных для вкладок
    executor_dept = None
    if func.executor_link:
        executor_dept = func.executor_link.department

    consumer_links = []
    for link in func.consumer_links:
        consumer_links.append({
            'id': link.id,
            'department_id': link.department.id,
            'department_name': link.department.name,
            'description': link.description,
        })

    supplier_links = []
    for link in func.supplier_links:
        supplier_links.append({
            'id': link.id,
            'department_id': link.department.id,
            'department_name': link.department.name,
            'description': link.description,
        })

    func_data = {
        'id': func.id,
        'name': func.name,
        'description': func.description,
        'health': health,
        'health_label': health_label,
        'health_cls': health_cls,
        'spark_color': spark_color,
        'health_state': health_state,
        'ring_filled': ring_filled,
        'ring_empty': ring_empty,
        'initials': func.name[:2].upper(),
        'color': ['#2563EB', '#16A34A', '#7C3AED', '#0891B2', '#DB2777', '#EA580C', '#1D1D1F', '#F59E0B', '#EC4899'][func.id % 9],
        'executor_dept': executor_dept,
        'consumer_links': consumer_links,
        'supplier_links': supplier_links,
    }

    return render_template('company_function_detail.html',
                         function=type('F', (), func_data),
                         all_departments=Department.query.order_by(Department.name).all())

@app.route('/company/department/<int:department_id>')
@founder_required
def company_department_detail(department_id):
    """Детали отдела с вкладками."""
    dept = Department.query.get_or_404(department_id)

    health = compute_department_health(dept)
    health_label, health_cls = health_label_and_class(health)
    spark_color, health_state = health_spark_color_and_state(health)
    circ = 113.1
    ring_filled = round(health / 100 * circ, 1)
    ring_empty = round(circ - ring_filled, 1)

    # Подготовка данных для вкладок
    executor_links = []
    for link in dept.executor_links:
        executor_links.append({
            'id': link.id,
            'function_id': link.function.id,
            'function_name': link.function.name,
            'description': link.description,
        })

    consumer_links = []
    for link in dept.consumer_links:
        consumer_links.append({
            'id': link.id,
            'function_id': link.function.id,
            'function_name': link.function.name,
            'description': link.description,
        })

    supplier_links = []
    for link in dept.supplier_links:
        supplier_links.append({
            'id': link.id,
            'function_id': link.function.id,
            'function_name': link.function.name,
            'description': link.description,
        })

    dept_data = {
        'id': dept.id,
        'name': dept.name,
        'description': dept.description,
        'health': health,
        'health_label': health_label,
        'health_cls': health_cls,
        'spark_color': spark_color,
        'health_state': health_state,
        'ring_filled': ring_filled,
        'ring_empty': ring_empty,
        'initials': dept.name[:2].upper(),
        'color': ['#2563EB', '#16A34A', '#7C3AED', '#0891B2', '#DB2777', '#EA580C', '#1D1D1F', '#F59E0B', '#EC4899'][dept.id % 9],
        'executor_links': executor_links,
        'consumer_links': consumer_links,
        'supplier_links': supplier_links,
    }

    return render_template('company_department_detail.html',
                         department=type('D', (), dept_data),
                         all_functions=Function.query.order_by(Function.sort_order).all())

@app.route('/company/department/add', methods=['POST'])
@founder_required
def add_department():
    """Добавить новый отдел (без привязки к функции)."""
    name = request.form.get('name', '').strip()
    description = request.form.get('description', '').strip()

    if not name:
        flash('Название отдела обязательно', 'error')
        return redirect(url_for('company'))

    # Проверка на уникальность имени
    existing = Department.query.filter_by(name=name).first()
    if existing:
        flash(f'Отдел с именем "{name}" уже существует', 'error')
        return redirect(url_for('company'))

    dept = Department(
        name=name,
        description=description if description else None,
        created_by_id=g.user.id
    )
    db.session.add(dept)
    db.session.commit()

    flash(f'Отдел "{name}" создан', 'success')
    return redirect(url_for('company'))

@app.route('/company/function/<int:function_id>/description', methods=['POST'])
@founder_required
def update_function_description(function_id):
    """Обновить описание функции."""
    func = Function.query.get_or_404(function_id)
    description = request.form.get('description', '').strip()

    func.description = description if description else None
    db.session.commit()

    flash(f'Описание функции "{func.name}" обновлено', 'success')
    return redirect(url_for('company_function_detail', function_id=function_id))

@app.route('/company/department/<int:department_id>/description', methods=['POST'])
@founder_required
def update_department_description(department_id):
    """Обновить описание отдела."""
    dept = Department.query.get_or_404(department_id)
    description = request.form.get('description', '').strip()

    dept.description = description if description else None
    db.session.commit()

    flash(f'Описание отдела "{dept.name}" обновлено', 'success')
    return redirect(url_for('company_department_detail', department_id=department_id))

@app.route('/company/link/add', methods=['POST'])
@founder_required
def add_link():
    """Добавить или обновить связь между функцией и отделом."""
    function_id = request.form.get('function_id', type=int)
    department_id = request.form.get('department_id', type=int)
    relation_type = request.form.get('relation_type', '').lower()
    description = request.form.get('description', '').strip()
    return_to = request.form.get('return_to', 'function')  # 'function' или 'department'
    return_id = request.form.get('return_id', type=int)

    func = Function.query.get_or_404(function_id) if function_id else None
    dept = Department.query.get_or_404(department_id) if department_id else None

    if not func or not dept or relation_type not in ('executor', 'consumer', 'supplier'):
        flash('Некорректные параметры', 'error')
        return redirect(url_for('company'))

    # Для executor: удалить существующую executor-связь функции (мягкая проверка)
    if relation_type == 'executor':
        existing_executor = FunctionDepartmentLink.query.filter_by(
            function_id=function_id,
            relation_type='executor'
        ).first()
        if existing_executor and existing_executor.department_id != department_id:
            db.session.delete(existing_executor)
            db.session.commit()

    # Проверить на дублирование — если связь уже существует, обновить
    existing_link = FunctionDepartmentLink.query.filter_by(
        function_id=function_id,
        department_id=department_id,
        relation_type=relation_type
    ).first()

    if existing_link:
        existing_link.description = description if description else None
        existing_link.updated_at = datetime.utcnow()
    else:
        link = FunctionDepartmentLink(
            function_id=function_id,
            department_id=department_id,
            relation_type=relation_type,
            description=description if description else None,
            created_by_id=g.user.id
        )
        db.session.add(link)

    db.session.commit()

    flash(f'Связь добавлена: {func.name} ← {dept.name} ({relation_type})', 'success')

    if return_to == 'department' and return_id:
        return redirect(url_for('company_department_detail', department_id=return_id))
    elif return_to == 'function' and return_id:
        return redirect(url_for('company_function_detail', function_id=return_id))
    else:
        return redirect(url_for('company'))

@app.route('/company/link/<int:link_id>/remove', methods=['POST'])
@founder_required
def remove_link(link_id):
    """Удалить связь."""
    link = FunctionDepartmentLink.query.get_or_404(link_id)
    return_to = request.form.get('return_to', 'function')
    return_id = request.form.get('return_id', type=int)

    func_name = link.function.name
    dept_name = link.department.name
    relation_type = link.relation_type

    db.session.delete(link)
    db.session.commit()

    flash(f'Связь удалена: {func_name} ↔ {dept_name} ({relation_type})', 'success')

    if return_to == 'department' and return_id:
        return redirect(url_for('company_department_detail', department_id=return_id))
    elif return_to == 'function' and return_id:
        return redirect(url_for('company_function_detail', function_id=return_id))
    else:
        return redirect(url_for('company'))

if __name__ == '__main__':
    app.run(debug=True)
