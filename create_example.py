import sys
sys.path.insert(0, '.')

from app import app, db
from models import Client, Brief, BriefSection

with app.app_context():
    # Создаем компанию
    company = Client(name="TechStart — SaaS платформа")
    db.session.add(company)
    db.session.flush()

    # Создаем брифинг
    brief = Brief(
        brief_type='briefing',
        status='В работе',
        client_id=company.id
    )
    db.session.add(brief)
    db.session.flush()

    # Добавляем разделы
    sections = [
        {
            'section_name': 'Общая информация',
            'section_order': 1,
            'data': {
                'name': 'TechStart',
                'founded': '2022',
                'stage': 'Series A',
                'market': 'B2B SaaS',
                'country': 'USA'
            }
        },
        {
            'section_name': 'Продукты и услуги',
            'section_order': 2,
            'data': {
                'product': 'Платформа управления проектами',
                'monthly_revenue': '$120k',
                'mrr_growth': '15% month-over-month',
                'customers': '450+ компаний'
            }
        },
        {
            'section_name': 'Финансы',
            'section_order': 3,
            'data': {
                'monthly_revenue': 120000,
                'net_margin': 0.25,
                'runway': '18 месяцев',
                'last_fundraising': '$2.5M Series A',
                'burn_rate': '$40k/month'
            }
        },
        {
            'section_name': 'Команда',
            'section_order': 4,
            'data': {
                'headcount': 25,
                'founders': ['CEO - 10 лет опыта', 'CTO - ex-Google'],
                'turnover': '5%',
                'key_roles': ['CEO', 'CTO', 'VP Sales', 'VP Product']
            }
        },
        {
            'section_name': 'Технология',
            'section_order': 5,
            'data': {
                'stack': 'React, Node.js, PostgreSQL, AWS',
                'infrastructure': 'AWS Lambda, CloudFront',
                'api': 'REST + WebSockets',
                'uptime': '99.95%'
            }
        }
    ]

    for section_data in sections:
        section = BriefSection(
            brief_id=brief.id,
            **section_data
        )
        db.session.add(section)

    db.session.commit()
    print(f'Created: {company.name}')
    print(f'Sections: {len(sections)}')
    print('Ready for example!')
