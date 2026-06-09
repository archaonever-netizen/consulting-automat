from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime
from ..models import Brief, BriefSection


def get_brief_questions(brief_type: str) -> dict:
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
            'responsible_list': ['Руководитель отдела продаж', 'Менеджер по продажам', 'Другое'],
        },
    }
    return questions.get(brief_type, {})


async def create_brief(db: AsyncSession, brief_type: str, client_id: int) -> Brief:
    brief = Brief(
        brief_type=brief_type,
        status='Не заполнено',
        client_id=client_id,
    )
    db.add(brief)
    await db.commit()
    await db.refresh(brief)
    return brief


async def get_brief(db: AsyncSession, brief_id: int) -> Brief | None:
    result = await db.execute(
        select(Brief)
        .where(Brief.id == brief_id)
        .options(selectinload(Brief.sections))
    )
    return result.scalar_one_or_none()


async def update_brief(db: AsyncSession, brief_id: int, data) -> Brief | None:
    brief = await get_brief(db, brief_id)
    if brief is None:
        return None

    if data.answers:
        questions = get_brief_questions(brief.brief_type)
        if questions.get('type') == 'sales' or questions.get('metrics'):
            # Sales-бриф: плоский набор значений метрик/ответственных — храним как есть
            # в одной секции. На чтении секции мёржатся в общий answers.
            sec_name = '__sales__'
            existing = next((s for s in brief.sections if s.section_name == sec_name), None)
            if existing:
                existing.data = dict(data.answers)
                existing.updated_at = datetime.utcnow()
            else:
                from ..models import BriefSection
                db.add(BriefSection(brief_id=brief.id, section_name=sec_name, data=dict(data.answers)))
        else:
            for sec_def in questions.get('sections', []):
                sec_name = sec_def['title']
                sec_data = {
                    field: data.answers.get(f"{sec_name}||{field}", "")
                    for field in sec_def['fields']
                }
                existing = next((s for s in brief.sections if s.section_name == sec_name), None)
                if existing:
                    existing.data = sec_data
                    existing.updated_at = datetime.utcnow()
                else:
                    from ..models import BriefSection
                    new_sec = BriefSection(
                        brief_id=brief.id,
                        section_name=sec_name,
                        data=sec_data,
                    )
                    db.add(new_sec)

    if data.status:
        brief.status = data.status
    elif data.answers:
        filled = any(v for v in data.answers.values() if str(v).strip())
        all_filled = all(str(v).strip() for v in data.answers.values())
        if all_filled:
            brief.status = 'Заполнено'
        elif filled:
            brief.status = 'В работе'

    brief.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(brief)
    return brief


async def delete_brief(db: AsyncSession, brief_id: int) -> bool:
    brief = await get_brief(db, brief_id)
    if brief is None:
        return False
    await db.delete(brief)
    await db.commit()
    return True
