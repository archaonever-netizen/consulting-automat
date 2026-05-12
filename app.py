# app.py
import os
import json
from flask import Flask, render_template, request, redirect, url_for, jsonify
from models import db, Client, Brief
from fpdf import FPDF

# --- Настройка приложения ---
app = Flask(__name__)
# Путь к файлу базы данных. Render.com хранит данные в '/opt/render/project/src/'
db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'app.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# Создаем папку instance, если ее нет
os.makedirs('instance', exist_ok=True)
with app.app_context():
    db.create_all()

# --- Вспомогательные функции для анкет ---
def get_brief_questions(brief_type):
    """Возвращает структуру анкеты по её типу."""
    questions = {
        'briefing': {
            'title': 'Брифинг "Бизнес-портрет"',
            'sections': [
                {'title': 'Раздел 1. Общая информация о бизнесе', 'fields': ['Название компании', 'ОПФ', 'Год начала деятельности', 'Вид деятельности (ОКВЭД)', 'География работы', 'Стадия жизненного цикла']},
                {'title': 'Раздел 2. Продукты и услуги', 'fields': ['Товарные группы', 'Доля в выручке (%)', 'Сезонность', 'Средняя себестоимость', 'Частота обновления ассортимента', 'Продукт-локомотив']},
                {'title': 'Раздел 3. Клиенты и рынок (субъективная картина)', 'fields': ['Портрет идеального клиента', 'Клиентские сегменты', 'Количество активных клиентов', 'Средний чек', 'Каналы привлечения', 'Частота повторных покупок', 'Длительность сделки', 'Эффективные каналы']},
                {'title': 'Раздел 4. Финансовые показатели', 'fields': ['Среднемесячная выручка', 'Чистая прибыль/EBITDA', 'Доля постоянных расходов', 'Кассовые разрывы', 'Финансовая подушка', 'Дебиторская задолженность', 'Кредиты/займы', 'Управленческий учет']},
                {'title': 'Раздел 5. Команда и оргструктура', 'fields': ['Количество сотрудников', 'Ключевые роли', 'Точка замыкания задач', 'Организационная схема', 'Текучесть персонала', 'Лояльность команды']},
                {'title': 'Раздел 6. Операционные процессы и ИТ', 'fields': ['Описание бизнес-процесса', 'Используемое ПО', 'Интеграции', 'Хранение данных', 'Неудобства в ИТ', 'Регламенты']},
                {'title': 'Раздел 7. Маркетинг и продажи', 'fields': ['Бюджет на маркетинг', 'Платные каналы', 'Конверсия', 'Бренд-бук', 'Обратная связь', 'Программа лояльности']},
                {'title': 'Раздел 8. Конкуренты и позиционирование', 'fields': ['Основные конкуренты', 'Конкурентные преимущества', 'Слабые стороны', 'Причины выбора клиентами', 'Случаи ухода клиентов']},
                {'title': 'Раздел 9. Цели, ожидания и ограничения', 'fields': ['Главная проблема', 'Ожидаемый результат', 'Бюджет на изменения', 'Сотрудники под риском', 'Юридические ограничения']},
                {'title': 'Раздел 10. Дополнительно', 'fields': ['Дополнительная информация', 'Ссылки на ресурсы']}
            ]
        },
        'point_a': {
            'title': 'Точка А: Боль, Цели и Ресурсы',
            'sections': [
                {'title': 'Блок 1. БОЛЬ — что сейчас работает хуже всего', 'fields': ['Три главные проблемы', 'Случаи потерь денег/клиентов', 'Что отнимает личное время', 'Невозможность делегирования', 'Что "починить" в первую очередь', 'Где работаете "на склад"']},
                {'title': 'Блок 2. ЦЕЛИ — зачем проводится аудит', 'fields': ['Управленческая задача', 'Критерии успешности аудита', 'Идеальный бизнес через год', 'Предыдущие попытки', 'Категорически неприемлемые решения']},
                {'title': 'Блок 3. РЕСУРСЫ — чем располагает бизнес', 'fields': ['Финансовые ресурсы', 'Человеческие ресурсы', 'Материальные/нематериальные активы', 'Временной ресурс', 'Личностный ресурс собственника']},
                {'title': 'Блок 4. ДАННЫЕ О СЕГМЕНТЕ РЫНКА И ОТРАСЛИ', 'fields': ['Идеальный клиент и причина выбора', 'Главные конкуренты', 'Изменения на рынке за год', 'Влияние законов/технологий', 'Объем рынка', 'Тренды рынка']}
            ]
        },
        'docs': {
            'title': 'Документация бизнеса',
            'sections': [
                {'title': '1. Организационная схема', 'fields': ['Наличие схемы', 'Описание иерархии']},
                {'title': '2. Ключевые процессы "как есть"', 'fields': ['Шаги основного БП', 'Ответственные', 'Время выполнения', 'Где ошибки/задержки']},
                {'title': '3. Финансовая отчётность', 'fields': ['ОПиУ за 3-6 мес.', 'ДДС за 3-6 мес']},
                {'title': '4. Данные о клиентах и заявках', 'fields': ['Выгрузка из CRM/Excel', 'Воронка продаж']},
                {'title': '5. Должностные инструкции', 'fields': ['Наличие инструкций', 'Описание функционала']},
                {'title': '6. Договоры с контрагентами', 'fields': ['Условия договоров', 'Ограничения']},
                {'title': '7. Скрипты продаж и шаблоны', 'fields': ['Наличие скриптов', 'Примеры диалогов']}
            ]
        }
    }
    return questions.get(brief_type, {})

# --- Маршруты (Роуты) для веб-интерфейса ---

@app.route('/')
def index():
    """Главная страница со списком клиентов."""
    clients = Client.query.order_by(Client.created_at.desc()).all()
    return render_template('index.html', clients=clients)

@app.route('/add_client', methods=['GET', 'POST'])
def add_client():
    """Создание новой карточки клиента."""
    if request.method == 'POST':
        name = request.form['name']
        client = Client(name=name)
        db.session.add(client)
        db.session.commit()
        return redirect(url_for('index'))
    return render_template('client_form.html')

@app.route('/client/<int:client_id>')
def client_briefs(client_id):
    """Страница со списком анкет клиента."""
    client = Client.query.get_or_404(client_id)
    # Получаем все анкеты клиента
    briefs_map = {}
    for brief in client.briefs:
        briefs_map[brief.brief_type] = brief
    
    # Создаем недостающие записи в БД для тех анкет, которых еще нет
    all_brief_types = [
        {'key': 'briefing', 'name': 'Брифинг "Бизнес-портрет"', 'desc': 'Основная анкета для сбора формальной информации о бизнесе.'},
        {'key': 'point_a', 'name': 'Точка А', 'desc': 'Глубинное интервью для выявления реальных проблем и целей.'},
        {'key': 'docs', 'name': 'Документация бизнеса', 'desc': 'Чек-лист для сбора документов и проверки наличия ключевых артефактов.'}
    ]
    for bt in all_brief_types:
        if bt['key'] not in briefs_map:
            new_brief = Brief(brief_type=bt['key'], client_id=client.id)
            db.session.add(new_brief)
            briefs_map[bt['key']] = new_brief
    
    db.session.commit()
    
    # Обновляем данные после коммита
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
    """Страница для заполнения анкеты."""
    brief = Brief.query.get_or_404(brief_id)
    questions_data = get_brief_questions(brief.brief_type)
    
    if request.method == 'POST':
        # Сохраняем ответы из формы в JSON-поле
        answers = {}
        for section in questions_data['sections']:
            for field in section['fields']:
                key = f"{section['title']}||{field}"
                value = request.form.get(key, '')
                if value.strip():
                    answers[key] = value
        
        brief.answers = answers
        # Если есть хоть один ответ, переводим статус в "В работе"
        if answers:
            brief.status = 'В работе'
        else:
            brief.status = 'Не заполнено'
        
        db.session.commit()
        
        # Если нажата кнопка "Сохранить и завершить"
        if 'complete' in request.form:
            brief.status = 'Заполнено'
            db.session.commit()
            return redirect(url_for('client_briefs', client_id=brief.client_id))
        
        # Если нажата кнопка "Сохранить"
        return redirect(url_for('brief_form', brief_id=brief.id))
    
    return render_template('brief_form.html', brief=brief, questions=questions_data)

@app.route('/brief/<int:brief_id>/pdf')
def generate_pdf(brief_id):
    """Генерация PDF-версии анкеты."""
    brief = Brief.query.get_or_404(brief_id)
    questions_data = get_brief_questions(brief.brief_type)
    answers = brief.answers or {}
    
    pdf = FPDF()
    pdf.add_font('DejaVu', '', '/opt/render/project/src/fonts/DejaVuSans.ttf', uni=True) # Путь к шрифту
    pdf.add_page()
    pdf.set_font('DejaVu', '', 10)
    
    # Заголовок
    pdf.set_font_size(14)
    pdf.cell(0, 10, txt=questions_data.get('title', 'Анкета'), ln=True, align='C')
    pdf.ln(5)
    
    # Информация о статусе
    pdf.set_font_size(10)
    pdf.cell(0, 6, txt=f'Статус: {brief.status}', ln=True)
    pdf.cell(0, 6, txt=f'Клиент: {brief.client.name}', ln=True)
    pdf.ln(10)
    
    # Заполняем секции и поля
    pdf.set_font_size(9)
    for section in questions_data.get('sections', []):
        pdf.set_font('DejaVu', 'B', 10)
        pdf.cell(0, 8, txt=section['title'], ln=True)
        pdf.set_font('DejaVu', '', 9)
        pdf.ln(2)
        
        for field in section['fields']:
            key = f"{section['title']}||{field}"
            value = answers.get(key, 'Нет ответа')
            pdf.set_font('DejaVu', 'B', 9)
            pdf.cell(0, 6, txt=f'{field}:', ln=True)
            pdf.set_font('DejaVu', '', 9)
            pdf.multi_cell(0, 6, txt=str(value))
            pdf.ln(1)
        
        pdf.ln(4)
    
    # Отправляем PDF-файл
    pdf_output = pdf.output(dest='S').encode('latin-1')
    from flask import make_response
    response = make_response(pdf_output)
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = f'inline; filename=brief_{brief_id}.pdf'
    return response

@app.route('/update_brief_status/<int:brief_id>', methods=['POST'])
def update_brief_status(brief_id):
    """Обновление статуса анкеты."""
    brief = Brief.query.get_or_404(brief_id)
    new_status = request.form.get('status')
    if new_status in ['Не заполнено', 'В работе', 'Заполнено']:
        brief.status = new_status
        db.session.commit()
    return redirect(url_for('brief_form', brief_id=brief.id))

if __name__ == '__main__':
    app.run(debug=True)
