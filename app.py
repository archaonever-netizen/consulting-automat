# app.py
import os
import json
from flask import Flask, render_template, request, redirect, url_for, jsonify, make_response
from models import db, Client, Brief
from fpdf import FPDF

# -------------------------------------------------------------------
# Настройка приложения
# -------------------------------------------------------------------
app = Flask(__name__)

# Подключение к базе данных: используем DATABASE_URL от Render (PostgreSQL),
# иначе локальный SQLite
database_url = os.environ.get('DATABASE_URL')
if database_url:
    # Render передаёт URL начиная с postgres://, SQLAlchemy требует postgresql://
    database_url = database_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
else:
    basedir = os.path.abspath(os.path.dirname(__file__))
    db_path = os.path.join(basedir, 'instance', 'app.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + db_path

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

with app.app_context():
    db.create_all()

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
def index():
    """Главная страница: список всех клиентов."""
    clients = Client.query.order_by(Client.created_at.desc()).all()
    return render_template('index.html', clients=clients)

@app.route('/add_client', methods=['GET', 'POST'])
def add_client():
    """Добавление нового клиента."""
    if request.method == 'POST':
        name = request.form['name']
        client = Client(name=name)
        db.session.add(client)
        db.session.commit()
        return redirect(url_for('index'))
    return render_template('client_form.html')

@app.route('/client/<int:client_id>')
def client_briefs(client_id):
    """Страница со списком анкет выбранного клиента."""
    client = Client.query.get_or_404(client_id)
    # Собираем существующие анкеты
    briefs_map = {}
    for brief in client.briefs:
        briefs_map[brief.brief_type] = brief

    all_brief_types = [
        {'key': 'briefing',
         'name': 'Брифинг "Бизнес-портрет"',
         'desc': 'Основная анкета для сбора формальной информации о бизнесе.'},
        {'key': 'point_a',
         'name': 'Точка А',
         'desc': 'Глубинное интервью для выявления реальных проблем и целей.'},
        {'key': 'docs',
         'name': 'Документация бизнеса',
         'desc': 'Чек-лист для сбора документов и проверки наличия ключевых артефактов.'}
    ]
    # Создаём отсутствующие анкеты (если их ещё нет в базе)
    for bt in all_brief_types:
        if bt['key'] not in briefs_map:
            new_brief = Brief(brief_type=bt['key'], client_id=client.id)
            db.session.add(new_brief)
            briefs_map[bt['key']] = new_brief
    db.session.commit()

    # Формируем удобный список для шаблона
    briefs = []
    for bt in all_brief_types:
        brief = Brief.query.filter_by(client_id=client.id, brief_type=bt['key']).first()
        briefs.append({
            'type': bt['key'],
            'name': bt['name'],
            'desc': bt['desc'],
            'status': brief.status,
            'id': brief.id,
            'updated_at': brief.updated_at.strftime('%d.%m.%Y %H:%M') if brief.updated_at else None
        })
    return render_template('briefs_list.html', client=client, briefs=briefs)

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

if __name__ == '__main__':
    app.run(debug=True)
