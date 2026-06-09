# app.py
import os
import json
import random
import uuid
import threading
import time as _time
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, jsonify, make_response, session, g, abort, flash
from models import db, Client, Brief, User, Role, Function, Department, FunctionDepartmentLink, AITask, AIAgentRun, UserTask, TaskCompletion, UserChatSession, UserSubChat, UserChatMessage
from fpdf import FPDF
from dotenv import load_dotenv

# Загружаем переменные окружения из .env.local
load_dotenv('.env.local')

# -------------------------------------------------------------------
# Настройка приложения
# -------------------------------------------------------------------
app = Flask(__name__)

# Хранилище фоновых задач оркестратора: task_id -> state dict
_tasks: dict = {}
_tasks_lock = threading.Lock()

def _cleanup_tasks():
    """Удалять задачи старше 30 минут чтобы не копить память."""
    cutoff = _time.time() - 1800
    with _tasks_lock:
        stale = [tid for tid, t in _tasks.items() if t.get('created_at', 0) < cutoff]
        for tid in stale:
            del _tasks[tid]

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
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,      # Проверять соединение перед использованием
    'pool_recycle': 3600,       # Переиспользовать соединение каждый час
    'pool_size': 10,            # Размер пула соединений
    'max_overflow': 20,         # Макс дополнительные соединения
}
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

def init_db():
    """Инициализировать БД с поддержкой миграций."""
    with app.app_context():
        try:
            print("[APP] Creating database tables...")
            db.create_all()
            print("[APP] Database tables created successfully")

            # Выполнить SQL миграции для подчатов если нужно
            try:
                from sqlalchemy import text

                print("[APP] Checking database schema...")

                # Пересоздать user_chat_sessions если нужно (удалить старые столбцы)
                try:
                    has_context_type = db.session.execute(text(
                        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_chat_sessions' AND column_name = 'context_type')"
                    )).scalar()

                    if has_context_type:
                        print("[APP] Cleaning up user_chat_sessions table...")
                        # Сохраним данные
                        db.session.execute(text("""
                            ALTER TABLE user_chat_sessions
                            DROP COLUMN IF EXISTS context_type,
                            DROP COLUMN IF EXISTS context_id
                        """))
                        print("[APP] Old columns removed")
                except Exception as e:
                    print(f"[APP] Could not clean columns: {e}")

                # Добавить UNIQUE constraint если его нет
                try:
                    db.session.execute(text("""
                        ALTER TABLE user_chat_sessions
                        ADD CONSTRAINT uq_user_chat_sessions_user_id UNIQUE (user_id)
                    """))
                except Exception as e:
                    print(f"[APP] UNIQUE constraint already exists: {e}")

                # Создать user_subchats если её нет
                result = db.session.execute(text(
                    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_subchats')"
                )).scalar()

                if not result:
                    print("[APP] Creating user_subchats table...")
                    db.session.execute(text("""
                        CREATE TABLE user_subchats (
                            id SERIAL PRIMARY KEY,
                            session_id INTEGER NOT NULL REFERENCES user_chat_sessions(id) ON DELETE CASCADE,
                            task_id INTEGER REFERENCES user_tasks(id) ON DELETE SET NULL,
                            version INTEGER DEFAULT 1,
                            tokens_used INTEGER DEFAULT 0,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    """))
                    print("[APP] user_subchats table created")

                # Добавить subchat_id в user_chat_messages если его нет
                result = db.session.execute(text(
                    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_chat_messages' AND column_name = 'subchat_id')"
                )).scalar()

                if not result:
                    print("[APP] Adding subchat_id column to user_chat_messages...")
                    db.session.execute(text("""
                        ALTER TABLE user_chat_messages
                        ADD COLUMN subchat_id INTEGER,
                        ADD COLUMN tokens INTEGER DEFAULT 0
                    """))
                    print("[APP] Columns added")

                db.session.commit()
                print("[APP] Database schema check completed successfully")
            except Exception as e:
                print(f"[APP] Migration warning: {e}")
                import traceback
                traceback.print_exc()
                db.session.rollback()

            print("[APP] Seeding functions...")
            seed_functions()
            print("[APP] Functions seeded successfully")

            print("[APP] Startup complete - agents will initialize lazily on first use")
        except Exception as e:
            print(f"[APP] ERROR during startup: {e}")
            import traceback
            traceback.print_exc()
            # Приложение продолжит работать даже если БД недоступна

init_db()

# -------------------------------------------------------------------
# Загрузка текущего пользователя и контекст-процессоры
# -------------------------------------------------------------------

@app.before_request
def load_logged_in_user():
    """Загрузить текущего пользователя из сессии."""
    try:
        print(f"[HTTP] {request.method} {request.path} - processing")
        if request.endpoint and request.endpoint == 'static':
            return
        user_id = session.get('user_id')
        g.user = User.query.get(user_id) if user_id else None
        print(f"[HTTP] {request.method} {request.path} - user loaded: {g.user is not None}")
    except Exception as e:
        print(f"[HTTP] ERROR in before_request: {e}")
        import traceback
        traceback.print_exc()
        raise

@app.context_processor
def inject_current_user():
    """Сделать текущего пользователя доступным в шаблонах."""
    return dict(current_user=getattr(g, 'user', None))

@app.context_processor
def inject_nav():
    """Счётчик клиентов для бейджа в сайдбаре."""
    try:
        # Cache count for 60 seconds to avoid slow queries on every request
        cache_key = '_nav_client_count'
        if cache_key not in g:
            g._nav_client_count_time = 0
            g._nav_client_count_value = 0

        current_time = _time.time()
        if current_time - g._nav_client_count_time > 60:
            g._nav_client_count_value = Client.query.count()
            g._nav_client_count_time = current_time

        return dict(nav_client_count=g._nav_client_count_value)
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

    executor_link = func.executor_link
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
        'executor_link': executor_link,
        'executor_dept': executor_dept,
        'consumer_links': consumer_links,
        'supplier_links': supplier_links,
    }

    return render_template('company_function_detail.html',
                         function=type('F', (), func_data)(),
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
                         department=type('D', (), dept_data)(),
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

# -------------------------------------------------------------------
# ИИ-агенты (AI Advisors)
# -------------------------------------------------------------------

@app.route('/api/agent/analyze', methods=['POST'])
@login_required
def agent_analyze():
    """API: Анализировать задачу через главного координатора (Orchestrator)."""
    try:
        from agents import get_orchestrator

        data = request.get_json()
        task_description = data.get('task_description', '').strip()
        client_id = data.get('client_id', type=int)

        if not task_description:
            return jsonify({'error': 'Task description is required'}), 400

        orchestrator = get_orchestrator()
        analysis = orchestrator.analyze_task(task_description)

        return jsonify(analysis), 200
    except Exception as e:
        return jsonify({'error': str(e), 'status': 'failed'}), 500


@app.route('/api/agent/project/<int:client_id>', methods=['POST'])
@login_required
def agent_orchestrate_project(client_id):
    """API: Запустить оркестрацию в фоне и вернуть task_id для polling."""
    client = Client.query.get_or_404(client_id)
    data = request.get_json()
    project_description = data.get('project_description', '').strip()
    task_functions = data.get('functions', None)

    if not project_description:
        return jsonify({'error': 'Project description is required'}), 400

    task_id = str(uuid.uuid4())
    with _tasks_lock:
        _tasks[task_id] = {
            'status': 'pending',
            'phase': 'pending',
            'functions': [],
            'completed_functions': [],
            'result': None,
            'error': None,
            'created_at': _time.time(),
        }

    def run():
        try:
            from agents import get_orchestrator
            with app.app_context():
                _cleanup_tasks()
                task_client = Client.query.get(client_id)
                client_name = task_client.name  # загружаем пока сессия открыта
                orchestrator = get_orchestrator()

                def on_progress(event, payload):
                    with _tasks_lock:
                        task = _tasks.get(task_id)
                        if task is None:
                            return
                        if event == 'phase':
                            task['phase'] = payload['phase']
                            if payload['phase'] == 'running':
                                task['functions'] = payload.get('functions', [])
                        elif event == 'function_done':
                            task['completed_functions'].append(payload['function'])

                result = orchestrator.orchestrate_project(
                    task_client, project_description, task_functions,
                    progress_callback=on_progress
                )
                with _tasks_lock:
                    if task_id in _tasks:
                        if isinstance(result, dict) and result.get('status') == 'failed':
                            _tasks[task_id]['status'] = 'failed'
                            _tasks[task_id]['error'] = result.get('error', 'Неизвестная ошибка')
                        else:
                            _tasks[task_id]['status'] = 'done'
                            _tasks[task_id]['result'] = result
                        _tasks[task_id]['phase'] = 'done'
        except Exception as e:
            import traceback
            print(f"[TASK {task_id}] Exception: {e}")
            traceback.print_exc()
            with _tasks_lock:
                if task_id in _tasks:
                    _tasks[task_id]['status'] = 'failed'
                    _tasks[task_id]['error'] = str(e)

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'task_id': task_id}), 202


@app.route('/api/agent/task/<task_id>', methods=['GET'])
@login_required
def get_task_status(task_id):
    """API: Получить статус фоновой задачи оркестрации."""
    with _tasks_lock:
        task = _tasks.get(task_id)
    if task is None:
        return jsonify({'error': 'Task not found'}), 404
    return jsonify(task), 200


@app.route('/api/agent/function/<int:function_id>/analyze', methods=['POST'])
@login_required
def agent_function_analyze(function_id):
    """API: Анализировать проект через конкретного функционального советника."""
    try:
        from agents import get_agent_by_function_name

        func = Function.query.get_or_404(function_id)
        data = request.get_json()

        client_id = data.get('client_id', type=int)
        project_description = data.get('project_description', '').strip()

        if not client_id or not project_description:
            return jsonify({'error': 'client_id and project_description are required'}), 400

        client = Client.query.get_or_404(client_id)

        agent = get_agent_by_function_name(func.name)
        if not agent:
            return jsonify({'error': f'Agent for function {func.name} not initialized'}), 500

        result = agent.analyze_project(client, project_description)

        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e), 'status': 'failed'}), 500


@app.route('/api/agent/function/<int:function_id>/plan', methods=['POST'])
@login_required
def agent_function_create_plan(function_id):
    """API: Создать план действий через функционального советника."""
    try:
        from agents import get_agent_by_function_name

        func = Function.query.get_or_404(function_id)
        data = request.get_json()

        client_id = data.get('client_id', type=int)
        project_context = data.get('project_context', '').strip()

        if not client_id or not project_context:
            return jsonify({'error': 'client_id and project_context are required'}), 400

        client = Client.query.get_or_404(client_id)

        agent = get_agent_by_function_name(func.name)
        if not agent:
            return jsonify({'error': f'Agent for function {func.name} not initialized'}), 500

        result = agent.create_action_plan(client, project_context)

        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e), 'status': 'failed'}), 500


@app.route('/api/agent/function/<int:function_id>/checklist', methods=['POST'])
@login_required
def agent_function_checklist(function_id):
    """API: Сгенерировать чек-лист через функционального советника."""
    try:
        from agents import get_agent_by_function_name

        func = Function.query.get_or_404(function_id)
        data = request.get_json()

        topic = data.get('topic', '').strip()

        if not topic:
            return jsonify({'error': 'topic is required'}), 400

        agent = get_agent_by_function_name(func.name)
        if not agent:
            return jsonify({'error': f'Agent for function {func.name} not initialized'}), 500

        result = agent.generate_checklist(topic)

        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e), 'status': 'failed'}), 500


# -------------------------------------------------------------------
# Яндекс.Календарь OAuth
# -------------------------------------------------------------------

@app.route('/auth/yandex', methods=['GET'])
@login_required
def auth_yandex():
    """Редирект на Яндекс OAuth."""
    try:
        from yandex_calendar import get_oauth_url
        oauth_url = get_oauth_url()
        return redirect(oauth_url)
    except Exception as e:
        flash(f'Ошибка при подключении календаря: {str(e)}', 'error')
        return redirect(url_for('home'))


@app.route('/auth/yandex/callback', methods=['GET'])
@login_required
def auth_yandex_callback():
    """Callback от Яндекс OAuth."""
    try:
        from yandex_calendar import exchange_code

        code = request.args.get('code')
        if not code:
            flash('Ошибка: код авторизации не получен', 'error')
            return redirect(url_for('home'))

        token_data = exchange_code(code)

        g.user.yandex_calendar_token = token_data['access_token']
        g.user.yandex_calendar_refresh_token = token_data.get('refresh_token')
        g.user.yandex_login = token_data['login']
        expires_in = token_data.get('expires_in', 3600)
        g.user.yandex_calendar_token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)

        db.session.commit()
        flash('Яндекс.Календарь успешно подключён!', 'success')
        return redirect(url_for('home'))
    except Exception as e:
        flash(f'Ошибка при подключении календаря: {str(e)}', 'error')
        return redirect(url_for('home'))


# -------------------------------------------------------------------
# Задачи (Tasks)
# -------------------------------------------------------------------

@app.route('/tasks', methods=['GET'])
@login_required
def tasks():
    """Список задач текущего пользователя."""
    user_tasks = UserTask.query.filter_by(created_by_id=g.user.id).order_by(UserTask.created_at.desc()).all()
    clients = Client.query.all()
    return render_template('tasks.html', tasks=user_tasks, clients=clients)


@app.route('/tasks/create', methods=['POST'])
@login_required
def create_task():
    """Создать новую задачу."""
    try:
        title = request.form.get('title', '').strip()
        client_id = request.form.get('client_id', type=int)
        assigned_to_id = request.form.get('assigned_to_id', type=int) or None
        start_time_str = request.form.get('start_time', '').strip()
        duration_minutes = request.form.get('duration_minutes', type=int) or None
        input_data = request.form.get('input_data', '').strip() or None
        goal = request.form.get('goal', '').strip() or None
        action_description = request.form.get('action_description', '').strip() or None
        expected_result = request.form.get('expected_result', '').strip() or None

        if not title or not client_id:
            return jsonify({'error': 'title и client_id обязательны'}), 400

        client = Client.query.get_or_404(client_id)

        # Парсить дату/время если задано
        start_time = None
        if start_time_str:
            try:
                start_time = datetime.fromisoformat(start_time_str)
            except ValueError:
                pass

        task = UserTask(
            title=title,
            client_id=client_id,
            assigned_to_id=assigned_to_id,
            created_by_id=g.user.id,
            start_time=start_time,
            duration_minutes=duration_minutes,
            input_data=input_data,
            goal=goal,
            action_description=action_description,
            expected_result=expected_result,
            status='pending'
        )

        db.session.add(task)
        db.session.flush()  # Получить ID для задачи

        # Создать событие в Яндекс.Календаре если есть токен
        if g.user.yandex_calendar_token:
            try:
                from yandex_calendar import create_event
                task.calendar_event_uid = create_event(g.user, task)
            except Exception as e:
                print(f"Ошибка создания события календаря: {e}")
                # Продолжить даже если календарь не работает

        db.session.commit()
        flash(f'Задача "{title}" создана', 'success')
        return redirect(url_for('tasks'))
    except Exception as e:
        db.session.rollback()
        flash(f'Ошибка создания задачи: {str(e)}', 'error')
        return redirect(url_for('tasks'))


@app.route('/tasks/<int:task_id>', methods=['GET'])
@login_required
def get_task(task_id):
    """Получить данные задачи (JSON)."""
    task = UserTask.query.get_or_404(task_id)

    # Проверить доступ
    if task.created_by_id != g.user.id:
        return jsonify({'error': 'Access denied'}), 403

    return jsonify({
        'id': task.id,
        'title': task.title,
        'client_id': task.client_id,
        'client_name': task.client.name,
        'assigned_to_id': task.assigned_to_id,
        'start_time': task.start_time.isoformat() if task.start_time else None,
        'duration_minutes': task.duration_minutes,
        'input_data': task.input_data,
        'goal': task.goal,
        'action_description': task.action_description,
        'expected_result': task.expected_result,
        'status': task.status,
        'created_at': task.created_at.isoformat(),
    }), 200


@app.route('/tasks/<int:task_id>/start', methods=['POST'])
@login_required
def start_task(task_id):
    """Начать выполнение задачи (изменить статус)."""
    task = UserTask.query.get_or_404(task_id)

    if task.created_by_id != g.user.id:
        return jsonify({'error': 'Access denied'}), 403

    task.status = 'in_progress'
    db.session.commit()

    return jsonify({'status': 'ok', 'task_status': task.status}), 200


@app.route('/tasks/<int:task_id>/complete', methods=['POST'])
@login_required
def complete_task(task_id):
    """Завершить задачу (сохранить результат, проверить незаполненные поля)."""
    try:
        task = UserTask.query.get_or_404(task_id)

        if task.created_by_id != g.user.id:
            return jsonify({'error': 'Access denied'}), 403

        data = request.get_json()
        actual_result = data.get('actual_result', '').strip() or None
        is_failure = data.get('is_failure', False)
        difficulties = data.get('difficulties', '').strip() or None
        how_overcome = data.get('how_overcome', '').strip() or None
        next_step = data.get('next_step', '').strip() or None

        # Создать/обновить запись о выполнении
        completion = TaskCompletion(
            task_id=task_id,
            actual_result=actual_result,
            is_failure=is_failure,
            difficulties=difficulties,
            how_overcome=how_overcome,
            next_step=next_step,
        )
        db.session.add(completion)

        # Обновить статус задачи
        task.status = 'failed' if is_failure else 'completed'
        task.updated_at = datetime.utcnow()

        db.session.commit()

        # Проверить незаполненные обязательные поля
        missing_fields = []
        if not task.input_data:
            missing_fields.append('input_data')
        if not task.goal:
            missing_fields.append('goal')
        if not task.action_description:
            missing_fields.append('action_description')
        if not task.expected_result:
            missing_fields.append('expected_result')

        # Если есть незаполненные поля — создать чат с AI
        if missing_fields:
            session = UserChatSession(
                user_id=g.user.id,
                title=f'Дозаполнение: {task.title}',
                context_type='task_manager',
                context_id=task_id
            )
            db.session.add(session)
            db.session.flush()

            # Добавить первое системное сообщение AI
            system_msg = UserChatMessage(
                session_id=session.id,
                role='assistant',
                content=f'Помогу вам дозаполнить задачу "{task.title}". '
                        f'Необходимо заполнить: {", ".join(missing_fields)}. '
                        f'Давайте начнём с первого поля.'
            )
            db.session.add(system_msg)
            db.session.commit()

            return jsonify({
                'status': 'ok',
                'missing_fields': missing_fields,
                'chat_session_id': session.id,
                'needs_chat': True
            }), 200

        return jsonify({'status': 'ok', 'needs_chat': False}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e), 'status': 'failed'}), 500


@app.route('/tasks/<int:task_id>/delete', methods=['POST'])
@login_required
def delete_task(task_id):
    """Удалить задачу и её событие из календаря."""
    try:
        task = UserTask.query.get_or_404(task_id)

        if task.created_by_id != g.user.id:
            return jsonify({'error': 'Access denied'}), 403

        # Удалить событие из календаря если оно есть
        if task.calendar_event_uid and g.user.yandex_calendar_token:
            try:
                from yandex_calendar import delete_event
                delete_event(g.user, task.calendar_event_uid)
            except Exception as e:
                print(f"Ошибка удаления события календаря: {e}")

        db.session.delete(task)
        db.session.commit()

        flash(f'Задача "{task.title}" удалена', 'success')
        return redirect(url_for('tasks'))
    except Exception as e:
        db.session.rollback()
        flash(f'Ошибка удаления задачи: {str(e)}', 'error')
        return redirect(url_for('tasks'))


# -------------------------------------------------------------------
# ИИ-Чат (User Chat with SubChats)
# -------------------------------------------------------------------

def get_or_create_main_session(user_id):
    """Получить или создать основную чат-сессию 'AI Assistant' для пользователя."""
    try:
        session = UserChatSession.query.filter_by(user_id=user_id).first()
        if not session:
            print(f"[CHAT] Creating main session for user {user_id}")
            session = UserChatSession(
                user_id=user_id,
                title='AI Assistant'
            )
            db.session.add(session)
            db.session.commit()
            print(f"[CHAT] Main session created: {session.id}")
        else:
            print(f"[CHAT] Using existing session: {session.id}")
        return session
    except Exception as e:
        print(f"[CHAT] ERROR in get_or_create_main_session: {e}")
        import traceback
        traceback.print_exc()
        raise


def get_or_create_subchat(session_id, task_id=None):
    """Получить существующий подчат или создать новый для задачи."""
    if task_id:
        # Найти последний подчат для этой задачи
        subchat = UserSubChat.query.filter_by(
            session_id=session_id,
            task_id=task_id
        ).order_by(UserSubChat.version.desc()).first()

        # Если существует и имеет < 100K токенов - использовать его
        if subchat and subchat.tokens_used < 100000:
            return subchat

        # Иначе создать новый с увеличенной версией
        new_version = (subchat.version + 1) if subchat else 1
        new_subchat = UserSubChat(
            session_id=session_id,
            task_id=task_id,
            version=new_version
        )
        db.session.add(new_subchat)
        db.session.commit()
        return new_subchat
    else:
        # Общий чат (без привязки к задаче)
        subchat = UserSubChat.query.filter_by(
            session_id=session_id,
            task_id=None
        ).order_by(UserSubChat.version.desc()).first()

        if subchat and subchat.tokens_used < 100000:
            return subchat

        new_version = (subchat.version + 1) if subchat else 1
        new_subchat = UserSubChat(
            session_id=session_id,
            version=new_version
        )
        db.session.add(new_subchat)
        db.session.commit()
        return new_subchat


@app.route('/chat', methods=['GET'])
@login_required
def chat():
    """Главная страница чата с AI Assistant."""
    session = get_or_create_main_session(g.user.id)
    return render_template('chat.html', session=session)


@app.route('/api/chat/subchats', methods=['GET'])
@login_required
def get_subchats():
    """Получить список подчатов в сессии пользователя."""
    session = get_or_create_main_session(g.user.id)
    subchats = UserSubChat.query.filter_by(session_id=session.id).order_by(
        UserSubChat.created_at.desc()
    ).all()

    return jsonify([{
        'id': sc.id,
        'task_id': sc.task_id,
        'task_title': sc.task.title if sc.task else 'Общий чат',
        'version': sc.version,
        'tokens_used': sc.tokens_used,
        'created_at': sc.created_at.isoformat(),
        'message_count': len(sc.messages)
    } for sc in subchats]), 200


@app.route('/api/chat/subchat/<int:subchat_id>/messages', methods=['GET'])
@login_required
def get_subchat_messages(subchat_id):
    """Получить сообщения из подчата."""
    subchat = UserSubChat.query.get_or_404(subchat_id)
    session = subchat.session

    # Проверка доступа
    if session.user_id != g.user.id:
        abort(403)

    messages = UserChatMessage.query.filter_by(subchat_id=subchat_id).order_by(
        UserChatMessage.created_at.asc()
    ).all()

    return jsonify([{
        'id': m.id,
        'role': m.role,
        'content': m.content,
        'tokens': m.tokens,
        'created_at': m.created_at.isoformat()
    } for m in messages]), 200


@app.route('/api/chat/subchat/<int:subchat_id>/send', methods=['POST'])
@login_required
def send_message_to_subchat(subchat_id):
    """Отправить сообщение в подчат и получить ответ AI."""
    try:
        subchat = UserSubChat.query.get_or_404(subchat_id)
        session = subchat.session

        # Проверка доступа
        if session.user_id != g.user.id:
            abort(403)

        # Проверка лимита токенов
        if subchat.tokens_used >= 100000:
            return jsonify({'error': 'Подчат достиг лимита токенов. Создан новый.', 'need_new_subchat': True}), 429

        data = request.get_json()
        user_message = data.get('message', '').strip()

        if not user_message:
            return jsonify({'error': 'Message is required'}), 400

        # Сохранить сообщение пользователя
        user_msg = UserChatMessage(
            subchat_id=subchat_id,
            role='user',
            content=user_message,
            tokens=len(user_message.split()) * 1.3  # приблизительно
        )
        db.session.add(user_msg)
        db.session.flush()

        # Получить историю из подчата
        messages = UserChatMessage.query.filter_by(subchat_id=subchat_id).order_by(
            UserChatMessage.created_at.asc()
        ).all()

        # Определить системный промпт
        system_prompt = """Ты — полезный ИИ-ассистент в системе управления консалтингом ШЕФ.
Помогаешь пользователю с аналитикой, стратегией и планированием.
Отвечай кратко, структурированно и по существу."""

        # Если подчат привязан к задаче - использовать task_manager промпт
        if subchat.task_id:
            task = subchat.task
            if task:
                missing = []
                if not task.input_data:
                    missing.append('input_data')
                if not task.goal:
                    missing.append('goal')
                if not task.action_description:
                    missing.append('action_description')
                if not task.expected_result:
                    missing.append('expected_result')

                if missing:
                    field_names = {
                        'input_data': 'Вводные данные',
                        'goal': 'Цель действия',
                        'action_description': 'Само действие',
                        'expected_result': 'Ожидаемый результат'
                    }
                    missing_names = ', '.join(field_names.get(f, f) for f in missing)

                    system_prompt = f"""Ты — ИИ-менеджер задач в системе ШЕФ.
Твоя задача помочь дозаполнить незаполненные поля задачи: "{task.title}"

Текущие незаполненные поля: {missing_names}

Инструкции:
1. Задавай РОВНО ОДИН вопрос за раз
2. После ответа пользователя определи: является ли ответ однозначным значением для поля?
3. Если да и ответ полный - ОБЯЗАТЕЛЬНО в конце своего ответа верни JSON: {{"field": "...", "value": "...", "done": false}}
   где field может быть: input_data, goal, action_description, expected_result
4. Структурируй значение емко и коротко (максимум 2-3 предложения)
5. Если все поля заполнены - верни {{"done": true}}

Говори кратко и по существу, на русском языке."""

        # Собрать сообщения для LLM
        llm_messages = [
            {'role': 'system', 'content': system_prompt}
        ]
        llm_messages.extend([
            {'role': m.role, 'content': m.content}
            for m in messages
        ])

        # Вызвать LLM
        from promptra_client import PromtraClient
        from deepseek_config import DeepSeekConfig

        client = PromtraClient()
        response = client.chat_completion(
            messages=llm_messages,
            model=DeepSeekConfig.CHAT_MODEL,
            temperature=0.5,
            max_tokens=300
        )

        if response.get('error'):
            return jsonify({'error': f"LLM error: {response['error']}"}), 500

        ai_response = response['content']
        tokens_used = response.get('tokens_used', 0)

        # Сохранить ответ AI
        ai_msg = UserChatMessage(
            subchat_id=subchat_id,
            role='assistant',
            content=ai_response,
            tokens=tokens_used
        )
        db.session.add(ai_msg)

        # Обновить счётчик токенов в подчате
        subchat.tokens_used += tokens_used

        # Если это task_manager - попытаться парсить JSON и обновить задачу
        parsed_json = None
        if subchat.task_id:
            try:
                import json
                if '{' in ai_response and '}' in ai_response:
                    start = ai_response.rfind('{')
                    end = ai_response.rfind('}') + 1
                    if start >= 0 and end > start:
                        json_str = ai_response[start:end]
                        parsed_json = json.loads(json_str)

                        if parsed_json.get('field') and parsed_json.get('value'):
                            task = subchat.task
                            if task:
                                setattr(task, parsed_json['field'], parsed_json['value'])
                                task.updated_at = datetime.utcnow()
            except Exception as e:
                print(f"Ошибка парсинга JSON: {e}")

        db.session.commit()

        return jsonify({
            'response': ai_response,
            'parsed_json': parsed_json,
            'tokens_used': tokens_used,
            'subchat_tokens': subchat.tokens_used
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'status': 'failed'}), 500


# -------------------------------------------------------------------
# Фоновый worker для проверки незаполненных задач
# -------------------------------------------------------------------

def check_incomplete_tasks():
    """Проверяет все незаполненные задачи и создаёт подчаты для них."""
    while True:
        try:
            with app.app_context():
                # Найти все пользователей
                users = User.query.all()

                for user in users:
                    try:
                        # Получить основную сессию пользователя
                        session = get_or_create_main_session(user.id)

                        # Найти все задачи с незаполненными полями
                        incomplete_tasks = UserTask.query.filter_by(
                            created_by_id=user.id,
                            status='pending'
                        ).all()

                        for task in incomplete_tasks:
                            # Проверить незаполненные поля
                            missing = []
                            if not task.input_data:
                                missing.append('input_data')
                            if not task.goal:
                                missing.append('goal')
                            if not task.action_description:
                                missing.append('action_description')
                            if not task.expected_result:
                                missing.append('expected_result')

                            # Если есть незаполненные - создать подчат
                            if missing:
                                # Проверить нет ли уже активного подчата для этой задачи
                                existing = UserSubChat.query.filter_by(
                                    session_id=session.id,
                                    task_id=task.id
                                ).filter(UserSubChat.tokens_used < 100000).first()

                                if not existing:
                                    # Создать новый подчат
                                    subchat = UserSubChat(
                                        session_id=session.id,
                                        task_id=task.id,
                                        version=1
                                    )
                                    db.session.add(subchat)
                                    db.session.flush()

                                    # Добавить первое сообщение от ассистента
                                    initial_msg = UserChatMessage(
                                        subchat_id=subchat.id,
                                        role='assistant',
                                        content=f'Привет! Помогу заполнить задачу "{task.title}". '
                                               f'Давайте начнём с первого поля.'
                                    )
                                    db.session.add(initial_msg)

                                db.session.commit()

                    except Exception as e:
                        print(f"[WORKER] Ошибка при проверке задач пользователя {user.id}: {e}")
                        db.session.rollback()

            # Проверять каждые 5 секунд
            _time.sleep(5)

        except Exception as e:
            print(f"[WORKER] Критическая ошибка в worker: {e}")
            _time.sleep(10)


# Запустить worker в фоновом потоке при старте приложения
_worker_thread = threading.Thread(target=check_incomplete_tasks, daemon=True)
_worker_thread.start()
print("[APP] Background task worker started")


if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)
