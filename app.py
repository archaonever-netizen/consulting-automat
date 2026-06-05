# app.py
import os
import json
import random
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, jsonify, make_response, session
from models import db, Client, Brief
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

with app.app_context():
    try:
        db.create_all()
    except Exception as e:
        print(f"Warning: Could not create tables: {e}")
        # Приложение продолжит работать даже если БД недоступна

@app.context_processor
def inject_nav():
    """Счётчик клиентов для бейджа в сайдбаре."""
    try:
        return dict(nav_client_count=Client.query.count())
    except Exception:
        return dict(nav_client_count=0)

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
        }
    }
    return questions.get(brief_type, {})

# -------------------------------------------------------------------
# Маршруты (роуты) приложения
# -------------------------------------------------------------------

@app.route('/')
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
def add_client():
    """Добавление нового клиента."""
    if request.method == 'POST':
        name = request.form['name']
        client = Client(name=name)
        db.session.add(client)
        db.session.commit()
        return redirect(url_for('clients'))
    return render_template('client_form.html')

@app.route('/client/<int:client_id>/edit', methods=['GET', 'POST'])
def edit_client(client_id):
    """Редактирование имени клиента."""
    client = Client.query.get_or_404(client_id)
    if request.method == 'POST':
        client.name = request.form['name']
        db.session.commit()
        return redirect(url_for('clients'))
    return render_template('client_form.html', client=client, edit_mode=True)

@app.route('/client/<int:client_id>/delete', methods=['POST'])
def delete_client(client_id):
    """Удаление клиента и всех его анкет."""
    client = Client.query.get_or_404(client_id)
    db.session.delete(client)
    db.session.commit()
    return redirect(url_for('clients'))

@app.route('/client/<int:client_id>')
def client_briefs(client_id):
    """Детальная карточка клиента с вкладками (Обзор, Брифы, …)."""
    client = Client.query.get_or_404(client_id)
    palette = ['#1D1D1F','#2563EB','#16A34A','#7C3AED','#0891B2','#DB2777','#EA580C']

    all_brief_types = [
        {'key': 'briefing',
         'name': 'Брифинг "Бизнес-портрет"',
         'desc': 'Основная анкета для сбора формальной информации о бизнесе клиента.'},
        {'key': 'point_a',
         'name': 'Точка А',
         'desc': 'Глубинное интервью: реальные боли, цели и ресурсы бизнеса.'},
        {'key': 'docs',
         'name': 'Документация',
         'desc': 'Чек-лист сбора документов и ключевых артефактов бизнеса.'},
    ]

    # Гарантируем наличие всех трёх анкет
    briefs_map = {b.brief_type: b for b in client.briefs}
    for bt in all_brief_types:
        if bt['key'] not in briefs_map:
            nb = Brief(brief_type=bt['key'], client_id=client.id)
            db.session.add(nb)
            briefs_map[bt['key']] = nb
    db.session.commit()

    done = sum(1 for b in briefs_map.values() if b.status == 'Заполнено')
    total = 3

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

    # Список брифов для вкладки «Брифы»
    briefs_list = []
    for bt in all_brief_types:
        b = Brief.query.filter_by(client_id=client.id, brief_type=bt['key']).first()
        briefs_list.append({
            'type': bt['key'],
            'name': bt['name'],
            'desc': bt['desc'],
            'status': b.status,
            'id': b.id,
            'updated_at': b.updated_at.strftime('%d.%m.%Y %H:%M') if b.updated_at else None,
        })

    # Активность: последние изменения брифов
    events = []
    for b in client.briefs:
        if b.updated_at:
            bname = next((x['name'] for x in all_brief_types if x['key'] == b.brief_type), b.brief_type)
            events.append({
                'kind': 'doc',
                'time': b.updated_at.strftime('%d.%m.%Y %H:%M'),
                'text': f'Анкета «{bname}» — {b.status}',
                'ts': b.updated_at,
            })
    events.sort(key=lambda x: x['ts'], reverse=True)
    activity = events[:5]
    if not activity:
        activity = [{'kind': 'doc', 'time': '—', 'text': 'Активности пока нет'}]

    # Рекомендуемые шаги (B3 — статика пока брифы не заполнены полностью)
    steps = []
    for bt in all_brief_types:
        b = briefs_map.get(bt['key'])
        if b and b.status != 'Заполнено':
            steps.append({'title': f'Заполнить «{bt["name"]}»',
                          'desc': bt['desc']})
    if not steps:
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
def brief_form(brief_id):
    """Заполнение конкретной анкеты."""
    brief = Brief.query.get_or_404(brief_id)
    questions_data = get_brief_questions(brief.brief_type)

    if request.method == 'POST':
        # Собираем все ответы из формы
        answers = {}
        for section in questions_data['sections']:
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
def update_brief_status(brief_id):
    """Ручное обновление статуса анкеты."""
    brief = Brief.query.get_or_404(brief_id)
    new_status = request.form.get('status')
    if new_status in ['Не заполнено', 'В работе', 'Заполнено']:
        brief.status = new_status
        db.session.commit()
    return redirect(url_for('brief_form', brief_id=brief.id))

@app.route('/brief/<int:brief_id>/autosave', methods=['POST'])
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
def analytics():
    return render_template('empty_section.html', section=_EMPTY_SECTIONS['analytics'])

@app.route('/tasks')
def tasks():
    return render_template('empty_section.html', section=_EMPTY_SECTIONS['tasks'])

@app.route('/templates')
def templates_view():
    return render_template('empty_section.html', section=_EMPTY_SECTIONS['templates'])

@app.route('/knowledge')
def knowledge():
    return render_template('empty_section.html', section=_EMPTY_SECTIONS['knowledge'])

@app.route('/settings')
def settings():
    return render_template('empty_section.html', section=_EMPTY_SECTIONS['settings'])


if __name__ == '__main__':
    app.run(debug=True)
