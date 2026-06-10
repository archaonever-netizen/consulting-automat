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
        'marketing': {
            'title': 'Брифинг "Маркетинг"',
            'type': 'marketing',
            'metrics': [
                {'id': '2.1', 'question': 'Доля маркетингового бюджета в выручке за квартал', 'inputs': [{'label': 'Маркетинговый бюджет (тыс. руб.)', 'hint': 'Все затраты с аналитикой «Маркетинг» за квартал', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'Выручка за квартал (тыс. руб.)', 'hint': 'Общая выручка компании', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': '(Бюджет / Выручка) × 100%', 'calc_type': 'division_percent', 'responsible': 'Директор по маркетингу', 'health_threshold': 15, 'health_comparison': 'lte', 'health_note': 'Доля бюджета от выручки ≤ 15% (оптимум 10–15%)'},
                {'id': '2.2', 'question': 'Показатель ROMI за последний квартал', 'inputs': [{'label': 'Прирост маржинальной прибыли (тыс. руб.)', 'hint': 'Маржа, атрибутируемая маркетингу', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'Маркетинговый бюджет (тыс. руб.)', 'hint': 'Затраты на маркетинг за квартал', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': '((Прирост маржи − Бюджет) / Бюджет) × 100%', 'calc_type': 'growth_percent', 'responsible': 'Директор по маркетингу', 'health_threshold': 100, 'health_comparison': 'gte', 'health_note': 'ROMI ≥ 100% (окупаемость)'},
                {'id': '2.3', 'question': 'Запас воронки: лидов на одну цель по сделкам', 'inputs': [{'label': 'Сгенерировано лидов', 'hint': 'Все записи «Лид» за квартал', 'type': 'number', 'unit': 'шт.'}, {'label': 'Цель по сделкам (шт.)', 'hint': 'Плановое число сделок на квартал', 'type': 'number', 'unit': 'шт.'}], 'formula': 'Лиды / Цель по сделкам', 'calc_type': 'division', 'responsible': 'Директор по маркетингу', 'health_threshold': 3, 'health_comparison': 'gte', 'health_note': 'Лидов ≥ 3× цели по сделкам (запас воронки 3:1)'},
                {'id': '2.4', 'question': 'Стоимость привлечения лида относительно предельной (CPL)', 'inputs': [{'label': 'Фактический CPL (тыс. руб.)', 'hint': 'Бюджет / Количество лидов', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'Предельный CPL (тыс. руб.)', 'hint': 'Ср. чек × конверсия Лид→Сделка × маржинальность', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': 'CPL факт / CPL предельный', 'calc_type': 'division', 'responsible': 'Директор по маркетингу', 'health_threshold': 1, 'health_comparison': 'lte', 'health_note': 'CPL ≤ предельного (отношение ≤ 1.0) → ROMI ≥ 100%'},
                {'id': '2.5', 'question': 'Конверсия «Посетитель сайта → Лид» за квартал', 'inputs': [{'label': 'Уникальные посетители сайта', 'hint': 'Данные веб-аналитики', 'type': 'number'}, {'label': 'Лидов с сайта', 'hint': 'Заявки, полученные с сайта', 'type': 'number'}], 'formula': '(Лиды / Посетители) × 100%', 'calc_type': 'division_percent_reverse', 'responsible': 'Директор по маркетингу', 'health_threshold': 2, 'health_comparison': 'gte', 'health_note': 'Конверсия ≥ 2%'},
                {'id': '2.6', 'question': 'Спонтанная известность бренда (Top-of-Mind) в ЦА', 'inputs': [{'label': 'Назвали бренд первым (чел.)', 'hint': 'Респонденты, упомянувшие бренд первым', 'type': 'number'}, {'label': 'Всего респондентов (чел.)', 'hint': 'Размер выборки опроса', 'type': 'number'}], 'formula': '(Первые упоминания / Респонденты) × 100%', 'calc_type': 'division_percent', 'responsible': 'Директор по маркетингу', 'health_threshold': 10, 'health_comparison': 'gte', 'health_note': 'Top-of-Mind ≥ 10%'},
                {'id': '2.7', 'question': 'Динамика упоминаний бренда в digital-среде', 'inputs': [{'label': 'Среднемес. упоминаний (текущий квартал)', 'hint': 'Сумма за 3 месяца / 3', 'type': 'number'}, {'label': 'Среднемес. упоминаний (прошлый квартал)', 'hint': 'Аналогичный показатель прошлого квартала', 'type': 'number'}], 'formula': '((Текущ − Прошл) / Прошл) × 100%', 'calc_type': 'growth_percent', 'responsible': 'Директор по маркетингу', 'health_threshold': 10, 'health_comparison': 'gte', 'health_note': 'Прирост к прошлому кварталу ≥ 10%'},
                {'id': '2.8', 'question': 'Наличие утверждённой контент-стратегии на квартал', 'inputs': [{'label': 'Контент-стратегия утверждена', 'hint': 'Подписана и покрывает текущий квартал', 'type': 'yesno'}], 'formula': 'Документ утверждён и действует', 'calc_type': 'yesno', 'responsible': 'Директор по маркетингу', 'health_threshold': 'yes', 'health_comparison': 'eq', 'health_note': 'Контент-стратегия должна быть утверждена (Да)'},
                {'id': '2.9', 'question': 'Доля активностей с задокументированным post-mortem', 'inputs': [{'label': 'Активностей с post-mortem', 'hint': 'Кампании с разбором итогов', 'type': 'number'}, {'label': 'Всего активностей', 'hint': 'Все кампании за квартал', 'type': 'number'}], 'formula': '(С post-mortem / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Директор по маркетингу', 'health_threshold': 100, 'health_comparison': 'gte', 'health_note': '100% активностей анализируются (PDCA)'},
                {'id': '2.10', 'question': 'Доля квалифицированных маркетингом лидов (MQL)', 'inputs': [{'label': 'Количество MQL', 'hint': 'Лиды, соответствующие критериям MQL', 'type': 'number'}, {'label': 'Всего лидов', 'hint': 'Общий лидопоток за квартал', 'type': 'number'}], 'formula': '(MQL / Всего лидов) × 100%', 'calc_type': 'division_percent', 'responsible': 'Директор по маркетингу', 'health_threshold': 50, 'health_comparison': 'gte', 'health_note': 'Доля MQL ≥ 50%'},
            ],
            'responsible_list': ['Директор по маркетингу', 'Маркетолог', 'Другое'],
        },
        'service': {
            'title': 'Брифинг "Сервис (операции)"',
            'type': 'service',
            'metrics': [
                {'id': '3.1', 'question': 'Коэффициент утилизации оплачиваемого персонала за месяц', 'inputs': [{'label': 'Оплачиваемые часы', 'hint': 'Часы, выставленные клиентам', 'type': 'number', 'unit': 'ч'}, {'label': 'Доступные часы', 'hint': 'Рабочий фонд сотрудников', 'type': 'number', 'unit': 'ч'}], 'formula': '(Оплачиваемые / Доступные) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель сервиса', 'health_threshold': 70, 'health_comparison': 'gte', 'health_note': '70–80% оптимум; <60% недозагрузка, >90% выгорание'},
                {'id': '3.2', 'question': 'Средняя маржинальность закрытых проектов за квартал', 'inputs': [{'label': 'Выручка проектов (тыс. руб.)', 'hint': 'Сумма выручки закрытых проектов', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'Прямые затраты (тыс. руб.)', 'hint': 'Труд, материалы, подрядчики', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': '((Выручка − Затраты) / Выручка) × 100%', 'calc_type': 'margin_percent', 'responsible': 'Руководитель сервиса', 'health_threshold': 40, 'health_comparison': 'gte', 'health_note': 'Валовая маржа ≥ 40%'},
                {'id': '3.3', 'question': 'Доля проектов, завершённых в срок (On-Time Delivery)', 'inputs': [{'label': 'Сдано в срок', 'hint': 'Проекты, сданные не позднее плана', 'type': 'number'}, {'label': 'Всего завершённых проектов', 'hint': 'Все проекты с плановой датой в квартале', 'type': 'number'}], 'formula': '(В срок / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель сервиса', 'health_threshold': 90, 'health_comparison': 'gte', 'health_note': 'On-Time Delivery ≥ 90%'},
                {'id': '3.4', 'question': 'Доля услуг, принятых без замечаний с первого раза', 'inputs': [{'label': 'Принято без замечаний', 'hint': 'Акты подписаны сразу', 'type': 'number'}, {'label': 'Всего сданных услуг', 'hint': 'Все сданные услуги за месяц', 'type': 'number'}], 'formula': '(Без замечаний / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель сервиса', 'health_threshold': 90, 'health_comparison': 'gte', 'health_note': 'Right first time ≥ 90%'},
                {'id': '3.5', 'question': 'Индекс CSAT по транзакционному опросу (шкала 1–5)', 'inputs': [{'label': 'Средний балл CSAT (1–5)', 'hint': 'Среднее арифметическое всех оценок', 'type': 'number'}], 'formula': 'Средний балл по шкале 1–5', 'calc_type': 'value', 'responsible': 'Руководитель сервиса', 'health_threshold': 4.0, 'health_comparison': 'gte', 'health_note': 'CSAT ≥ 4.0 из 5.0'},
                {'id': '3.6', 'question': 'Доля обоснованных жалоб от числа оказанных услуг', 'inputs': [{'label': 'Обоснованных жалоб', 'hint': 'Претензии со статусом «обоснованная»', 'type': 'number'}, {'label': 'Всего оказанных услуг', 'hint': 'Все услуги за квартал', 'type': 'number'}], 'formula': '(Жалобы / Услуги) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель сервиса', 'health_threshold': 1, 'health_comparison': 'lte', 'health_note': 'Доля жалоб ≤ 1% (уровень 3σ)'},
                {'id': '3.7', 'question': 'Среднее время реакции на гарантийный случай (часы)', 'inputs': [{'label': 'Среднее время реакции (часов)', 'hint': 'От регистрации до первого контакта', 'type': 'number', 'unit': 'ч'}], 'formula': 'Σ(Контакт − Регистрация) / Кол-во', 'calc_type': 'value', 'responsible': 'Руководитель сервиса', 'health_threshold': 4, 'health_comparison': 'lte', 'health_note': 'Реакция ≤ 4 рабочих часов (ITIL 4, P2)'},
                {'id': '3.8', 'question': 'Актуальность стандарта сервисного процесса (Service Blueprint)', 'inputs': [{'label': 'Дата утверждения Service Blueprint', 'hint': 'Дата последней актуализации', 'type': 'date'}], 'formula': 'Возраст документа (мес.)', 'calc_type': 'date_age', 'responsible': 'Руководитель сервиса', 'health_threshold': 12, 'health_comparison': 'date_months', 'health_note': 'Утверждён и актуализирован ≤ 12 месяцев'},
                {'id': '3.9', 'question': 'Внедрённые улучшения сервиса по обратной связи за 6 мес.', 'inputs': [{'label': 'Количество внедрённых улучшений', 'hint': 'Задокументированы и внедрены за 6 мес.', 'type': 'number'}], 'formula': 'Подсчёт внедрённых улучшений', 'calc_type': 'value', 'responsible': 'Руководитель сервиса', 'health_threshold': 2, 'health_comparison': 'gte', 'health_note': 'Не менее 2 улучшений (работающий PDCA)'},
            ],
            'responsible_list': ['Руководитель сервиса', 'Менеджер проектов', 'Другое'],
        },
        'resources': {
            'title': 'Брифинг "Ресурсы и поставщики"',
            'type': 'resources',
            'metrics': [
                {'id': '4.1', 'question': 'Доля заявок на внешнего исполнителя, закрытых в срок', 'inputs': [{'label': 'Закрыто в срок', 'hint': 'Исполнитель найден в срок по регламенту', 'type': 'number'}, {'label': 'Всего заявок', 'hint': 'Поданные заявки за квартал', 'type': 'number'}], 'formula': '(В срок / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель закупок', 'health_threshold': 90, 'health_comparison': 'gte', 'health_note': 'Закрыто в срок ≥ 90% (уровень сервиса «А»)'},
                {'id': '4.2', 'question': 'Отклонение ставки внешних ресурсов от среднерыночной', 'inputs': [{'label': 'Средняя ставка факт (руб./час)', 'hint': 'Фактическая ставка привлечённых исполнителей', 'type': 'number', 'unit': 'руб./ч'}, {'label': 'Среднерыночная ставка (руб./час)', 'hint': 'По независимым источникам', 'type': 'number', 'unit': 'руб./ч'}], 'formula': '|(Факт − Рынок) / Рынок| × 100%', 'calc_type': 'abs_deviation_percent', 'responsible': 'Руководитель закупок', 'health_threshold': 10, 'health_comparison': 'lte', 'health_note': 'Отклонение в пределах ±10%'},
                {'id': '4.3', 'question': 'Доля критических партнёров с оценкой качества за 12 мес.', 'inputs': [{'label': 'Партнёров с оценкой', 'hint': 'Есть задокументированная оценка', 'type': 'number'}, {'label': 'Всего критических партнёров', 'hint': 'Утверждённый список', 'type': 'number'}], 'formula': '(С оценкой / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель закупок', 'health_threshold': 100, 'health_comparison': 'gte', 'health_note': '100% значимых поставщиков оценены (ISO 9001 п.8.4.1)'},
                {'id': '4.4', 'question': 'Интегральный уровень соблюдения SLA ключевыми поставщиками', 'inputs': [{'label': 'Средний % выполнения SLA', 'hint': 'Среднее (или взвешенное) по поставщикам', 'type': 'number'}], 'formula': 'Среднее % выполнения SLA', 'calc_type': 'value', 'responsible': 'Руководитель закупок', 'health_threshold': 95, 'health_comparison': 'gte', 'health_note': 'Соблюдение SLA ≥ 95%'},
                {'id': '4.5', 'question': 'Среднее время от заявки до получения (дни)', 'inputs': [{'label': 'Среднее время цикла закупки (дней)', 'hint': 'По стандартным закупкам', 'type': 'number', 'unit': 'дн.'}], 'formula': 'Σ(Получение − Подача) / Кол-во', 'calc_type': 'value', 'responsible': 'Руководитель закупок', 'health_threshold': 5, 'health_comparison': 'lte', 'health_note': 'Цикл ≤ 5 рабочих дней (стандартные закупки)'},
                {'id': '4.6', 'question': 'Актуальность реестра предквалифицированных поставщиков', 'inputs': [{'label': 'Дата последнего пересмотра реестра', 'hint': 'Дата утверждения актуальной версии', 'type': 'date'}], 'formula': 'Возраст документа (мес.)', 'calc_type': 'date_age', 'responsible': 'Руководитель закупок', 'health_threshold': 12, 'health_comparison': 'date_months', 'health_note': 'Реестр пересмотрен ≤ 12 месяцев назад'},
                {'id': '4.7', 'question': 'Доля бюджета внешних услуг под рамочными договорами', 'inputs': [{'label': 'Сумма рамочных договоров (тыс. руб.)', 'hint': 'Объём, проведённый через рамочные договоры', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'Общий бюджет внешних услуг (тыс. руб.)', 'hint': 'Все внешние услуги за квартал', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': '(Рамочные / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель закупок', 'health_threshold': 70, 'health_comparison': 'gte', 'health_note': 'Доля рамочных ≥ 70% (зрелая закупочная дисциплина)'},
            ],
            'responsible_list': ['Руководитель закупок', 'Менеджер по закупкам', 'Другое'],
        },
        'finance': {
            'title': 'Брифинг "Финансы"',
            'type': 'finance',
            'metrics': [
                {'id': '5.1', 'question': 'Коэффициент текущей ликвидности (Current Ratio)', 'inputs': [{'label': 'Оборотные активы (тыс. руб.)', 'hint': 'Данные баланса', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'Краткосрочные обязательства (тыс. руб.)', 'hint': 'Данные баланса', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': 'Оборотные активы / Краткосрочные обязательства', 'calc_type': 'division', 'responsible': 'Финансовый директор', 'health_threshold': 1.5, 'health_comparison': 'gte', 'health_note': 'Current Ratio ≥ 1.5'},
                {'id': '5.2', 'question': 'Рентабельность по EBITDA за квартал', 'inputs': [{'label': 'EBITDA (тыс. руб.)', 'hint': 'Из отчёта о прибылях и убытках', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'Выручка (тыс. руб.)', 'hint': 'Выручка за квартал', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': '(EBITDA / Выручка) × 100%', 'calc_type': 'division_percent', 'responsible': 'Финансовый директор', 'health_threshold': 20, 'health_comparison': 'gte', 'health_note': 'EBITDA-маржа ≥ 20%'},
                {'id': '5.3', 'question': 'Отклонение факта от плана по чистой прибыли', 'inputs': [{'label': 'Факт чистой прибыли (тыс. руб.)', 'hint': 'Из ОПУ за квартал', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'План чистой прибыли (тыс. руб.)', 'hint': 'Из утверждённого бюджета', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': '|(Факт − План) / План| × 100%', 'calc_type': 'abs_deviation_percent', 'responsible': 'Финансовый директор', 'health_threshold': 10, 'health_comparison': 'lte', 'health_note': 'Отклонение ≤ 10% (точность бюджетирования)'},
                {'id': '5.4', 'question': 'Доля просроченной ДЗ (>60 дней) в общей дебиторке', 'inputs': [{'label': 'Просроченная ДЗ >60 дней (тыс. руб.)', 'hint': 'Задолженность со сроком >60 дней', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'Общая ДЗ (тыс. руб.)', 'hint': 'Вся дебиторка на конец квартала', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': '(Просрочка >60дн / Общая ДЗ) × 100%', 'calc_type': 'division_percent', 'responsible': 'Финансовый директор', 'health_threshold': 5, 'health_comparison': 'lte', 'health_note': 'Просроченная ДЗ ≤ 5%'},
                {'id': '5.5', 'question': 'Операционный денежный поток (OCF) за квартал', 'inputs': [{'label': 'Операционный денежный поток (тыс. руб.)', 'hint': 'Чистый поток от операционной деятельности (ОДДС)', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': 'Чистые ден. средства от операционной деятельности', 'calc_type': 'value', 'responsible': 'Финансовый директор', 'health_threshold': 0, 'health_comparison': 'gt', 'health_note': 'OCF > 0 (деятельность генерирует деньги)'},
                {'id': '5.6', 'question': 'Срок закрытия управленческой отчётности (рабочие дни)', 'inputs': [{'label': 'Рабочих дней на закрытие', 'hint': 'От конца периода до выпуска отчётности', 'type': 'number', 'unit': 'дн.'}], 'formula': 'Рабочих дней до выпуска отчётности', 'calc_type': 'value', 'responsible': 'Финансовый директор', 'health_threshold': 5, 'health_comparison': 'lte', 'health_note': 'Закрытие ≤ 5 рабочих дней'},
                {'id': '5.7', 'question': 'Актуальность учётной политики (метод признания выручки)', 'inputs': [{'label': 'Дата последней редакции учётной политики', 'hint': 'Документ с разделом о признании выручки', 'type': 'date'}], 'formula': 'Возраст документа (мес.)', 'calc_type': 'date_age', 'responsible': 'Финансовый директор', 'health_threshold': 12, 'health_comparison': 'date_months', 'health_note': 'Актуализация ≤ 12 месяцев'},
                {'id': '5.8', 'question': 'Доля автоматизированных проверок при закрытии периода', 'inputs': [{'label': 'Автоматизированных процедур', 'hint': 'Число автоматических контрольных процедур', 'type': 'number'}, {'label': 'Всего контрольных процедур', 'hint': 'Все обязательные контроли', 'type': 'number'}], 'formula': '(Автоматических / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Финансовый директор', 'health_threshold': 80, 'health_comparison': 'gte', 'health_note': 'Автоматизация ≥ 80% (COBIT 2019)'},
            ],
            'responsible_list': ['Финансовый директор', 'Главный бухгалтер', 'Другое'],
        },
        'hr': {
            'title': 'Брифинг "Персонал (HR)"',
            'type': 'hr',
            'metrics': [
                {'id': '6.1', 'question': 'Коэффициент общей текучести кадров за 12 мес.', 'inputs': [{'label': 'Уволено за 12 мес. (чел.)', 'hint': 'Все причины увольнений', 'type': 'number', 'unit': 'чел.'}, {'label': 'Среднесписочная численность (чел.)', 'hint': 'За тот же период', 'type': 'number', 'unit': 'чел.'}], 'formula': '(Уволенные / Среднесписочная) × 100%', 'calc_type': 'division_percent', 'responsible': 'Директор по персоналу', 'health_threshold': 10, 'health_comparison': 'lte', 'health_note': 'Текучесть ≤ 10%'},
                {'id': '6.2', 'question': 'Коэффициент добровольной текучести за 12 мес.', 'inputs': [{'label': 'Уволено по собственному (чел.)', 'hint': 'Ушедшие по собственному желанию', 'type': 'number', 'unit': 'чел.'}, {'label': 'Среднесписочная численность (чел.)', 'hint': 'За тот же период', 'type': 'number', 'unit': 'чел.'}], 'formula': '(По собственному / Среднесписочная) × 100%', 'calc_type': 'division_percent', 'responsible': 'Директор по персоналу', 'health_threshold': 5, 'health_comparison': 'lte', 'health_note': 'Добровольная текучесть ≤ 5%'},
                {'id': '6.3', 'question': 'Динамика выручки на одного сотрудника (год к году)', 'inputs': [{'label': 'Выручка на сотрудника, текущий (тыс. руб.)', 'hint': 'Выручка за квартал / численность', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'Выручка на сотрудника, прошлый год (тыс. руб.)', 'hint': 'Аналогичный показатель год назад', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': '((Текущ − Прошл) / Прошл) × 100%', 'calc_type': 'growth_percent', 'responsible': 'Директор по персоналу', 'health_threshold': 5, 'health_comparison': 'gte', 'health_note': 'Рост производительности ≥ 5% год к году'},
                {'id': '6.4', 'question': 'Доля должностей с утверждёнными профилями компетенций', 'inputs': [{'label': 'Должностей с профилем', 'hint': 'Есть утверждённый профиль компетенций', 'type': 'number'}, {'label': 'Всего штатных должностей', 'hint': 'По штатному расписанию', 'type': 'number'}], 'formula': '(С профилем / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Директор по персоналу', 'health_threshold': 100, 'health_comparison': 'gte', 'health_note': '100% должностей с профилями компетенций'},
                {'id': '6.5', 'question': 'Индекс вовлечённости персонала по последнему опросу', 'inputs': [{'label': 'Индекс вовлечённости (% благоприятных)', 'hint': 'Например, по методике Gallup Q12', 'type': 'number'}], 'formula': '% благоприятных ответов', 'calc_type': 'value', 'responsible': 'Директор по персоналу', 'health_threshold': 70, 'health_comparison': 'gte', 'health_note': 'Вовлечённость ≥ 70% (верхний квартиль Gallup)'},
                {'id': '6.6', 'question': 'Среднее время закрытия вакансии за квартал (дни)', 'inputs': [{'label': 'Среднее время закрытия вакансии (дней)', 'hint': 'От открытия заявки до выхода сотрудника', 'type': 'number', 'unit': 'дн.'}], 'formula': 'Σ(Выход − Открытие) / Кол-во вакансий', 'calc_type': 'value', 'responsible': 'Директор по персоналу', 'health_threshold': 30, 'health_comparison': 'lte', 'health_note': 'Закрытие вакансии ≤ 30 дней'},
                {'id': '6.7', 'question': 'Доля сотрудников, прошедших обучение за 6 мес.', 'inputs': [{'label': 'Прошли обучение (чел.)', 'hint': 'Зафиксировано в учётной системе', 'type': 'number', 'unit': 'чел.'}, {'label': 'Всего сотрудников (чел.)', 'hint': 'Общая численность', 'type': 'number', 'unit': 'чел.'}], 'formula': '(Прошли обучение / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Директор по персоналу', 'health_threshold': 80, 'health_comparison': 'gte', 'health_note': 'Охват обучением ≥ 80%'},
                {'id': '6.8', 'question': 'Наличие годового цикла оценки результативности', 'inputs': [{'label': 'Performance Review проводится', 'hint': 'Есть документ и свидетельства проведения', 'type': 'yesno'}], 'formula': 'Документ утверждён и проводится', 'calc_type': 'yesno', 'responsible': 'Директор по персоналу', 'health_threshold': 'yes', 'health_comparison': 'eq', 'health_note': 'Годовой Performance Review должен быть (Да)'},
                {'id': '6.9', 'question': 'Доля hi-po сотрудников с индивидуальным планом развития', 'inputs': [{'label': 'HiPo с ИПР', 'hint': 'Подписанный ИПР на текущий период', 'type': 'number'}, {'label': 'Всего HiPo', 'hint': 'Утверждённый список hi-po', 'type': 'number'}], 'formula': '(HiPo с ИПР / Всего HiPo) × 100%', 'calc_type': 'division_percent', 'responsible': 'Директор по персоналу', 'health_threshold': 100, 'health_comparison': 'gte', 'health_note': '100% ключевых талантов с ИПР'},
            ],
            'responsible_list': ['Директор по персоналу', 'HR-менеджер', 'Другое'],
        },
        'it': {
            'title': 'Брифинг "Информационные технологии"',
            'type': 'it',
            'metrics': [
                {'id': '7.1', 'question': 'Фактический uptime критичных бизнес-систем за квартал', 'inputs': [{'label': 'Время доступности (мин.)', 'hint': 'Агрегированно по критичным системам', 'type': 'number', 'unit': 'мин.'}, {'label': 'Общее время периода (мин.)', 'hint': 'Длительность квартала в минутах', 'type': 'number', 'unit': 'мин.'}], 'formula': '(Доступность / Общее время) × 100%', 'calc_type': 'division_percent', 'responsible': 'IT-директор', 'health_threshold': 99.9, 'health_comparison': 'gte', 'health_note': 'Uptime ≥ 99.9% («три девятки»)'},
                {'id': '7.2', 'question': 'MTTR по критичным системам за квартал (часы)', 'inputs': [{'label': 'Среднее время восстановления (часов)', 'hint': 'От регистрации до восстановления', 'type': 'number', 'unit': 'ч'}], 'formula': 'Σ времени восстановления / Кол-во инцидентов', 'calc_type': 'value', 'responsible': 'IT-директор', 'health_threshold': 4, 'health_comparison': 'lte', 'health_note': 'MTTR ≤ 4 часов (P1, ITIL)'},
                {'id': '7.3', 'question': 'Количество инцидентов уровня P1 за квартал', 'inputs': [{'label': 'Количество инцидентов P1', 'hint': 'Полная остановка сервиса', 'type': 'number'}], 'formula': 'Подсчёт инцидентов с приоритетом P1', 'calc_type': 'value', 'responsible': 'IT-директор', 'health_threshold': 0, 'health_comparison': 'eq', 'health_note': '0 полных остановок (идеал)'},
                {'id': '7.4', 'question': 'Удовлетворённость внутренних заказчиков ИТ (шкала 1–5)', 'inputs': [{'label': 'Средний балл удовлетворённости (1–5)', 'hint': 'Среднее по респондентам', 'type': 'number'}], 'formula': 'Среднее арифметическое оценок', 'calc_type': 'value', 'responsible': 'IT-директор', 'health_threshold': 4.0, 'health_comparison': 'gte', 'health_note': 'Удовлетворённость ИТ ≥ 4.0'},
                {'id': '7.5', 'question': 'Доля ИТ-проектов в срок и в бюджете за 12 мес.', 'inputs': [{'label': 'Успешных проектов', 'hint': 'В срок и в бюджете', 'type': 'number'}, {'label': 'Всего проектов', 'hint': 'Завершённые проекты за 12 мес.', 'type': 'number'}], 'formula': '(Успешных / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'IT-директор', 'health_threshold': 75, 'health_comparison': 'gte', 'health_note': 'Успешных проектов ≥ 75% (PMI)'},
                {'id': '7.6', 'question': 'Доля рабочих станций с актуальными сигнатурами (≤48 ч)', 'inputs': [{'label': 'Станций с актуальными сигнатурами', 'hint': 'Сигнатуры не старше 48 часов', 'type': 'number'}, {'label': 'Всего станций', 'hint': 'Все рабочие станции', 'type': 'number'}], 'formula': '(Актуальные / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'IT-директор', 'health_threshold': 100, 'health_comparison': 'gte', 'health_note': '100% станций с актуальными сигнатурами (ISO 27001)'},
                {'id': '7.7', 'question': 'Актуальность политики управления доступом', 'inputs': [{'label': 'Дата последнего пересмотра политики', 'hint': 'Дата введения/пересмотра', 'type': 'date'}], 'formula': 'Возраст документа (мес.)', 'calc_type': 'date_age', 'responsible': 'IT-директор', 'health_threshold': 12, 'health_comparison': 'date_months', 'health_note': 'Политика доступа актуализирована ≤ 12 мес.'},
                {'id': '7.8', 'question': 'Наличие реестра информационных активов с категорированием', 'inputs': [{'label': 'Реестр активов с категориями есть', 'hint': 'Классификация по критичности', 'type': 'yesno'}], 'formula': 'Реестр существует и категорирован', 'calc_type': 'yesno', 'responsible': 'IT-директор', 'health_threshold': 'yes', 'health_comparison': 'eq', 'health_note': 'Реестр информационных активов должен быть (Да)'},
                {'id': '7.9', 'question': 'Доля бизнес-процессов с задокументированными SLA/OLA', 'inputs': [{'label': 'Процессов с SLA/OLA', 'hint': 'Есть согласованные SLA/OLA', 'type': 'number'}, {'label': 'Всего поддерживаемых процессов', 'hint': 'Процессы, поддерживаемые ИТ', 'type': 'number'}], 'formula': '(С SLA / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'IT-директор', 'health_threshold': 90, 'health_comparison': 'gte', 'health_note': 'Процессов с SLA/OLA ≥ 90% (COBIT 2019)'},
            ],
            'responsible_list': ['IT-директор', 'Системный администратор', 'Другое'],
        },
        'quality': {
            'title': 'Брифинг "Качество и клиентский опыт"',
            'type': 'quality',
            'metrics': [
                {'id': '8.1', 'question': 'Доля клиентских рекламаций от объёма услуг', 'inputs': [{'label': 'Количество рекламаций', 'hint': 'Официальные претензии за квартал', 'type': 'number'}, {'label': 'Всего оказанных услуг', 'hint': 'Объём услуг за квартал', 'type': 'number'}], 'formula': '(Рекламации / Услуги) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель службы качества / CX', 'health_threshold': 0.5, 'health_comparison': 'lte', 'health_note': 'Рекламаций ≤ 0.5% от объёма услуг'},
                {'id': '8.2', 'question': 'Коэффициент дефектности сервиса (на 100 услуг)', 'inputs': [{'label': 'Обоснованных дефектов', 'hint': 'Подтверждённые дефекты', 'type': 'number'}, {'label': 'Всего услуг', 'hint': 'Оказано услуг за квартал', 'type': 'number'}], 'formula': '(Дефекты / Услуги) × 100', 'calc_type': 'division_percent', 'responsible': 'Руководитель службы качества / CX', 'health_threshold': 1.0, 'health_comparison': 'lte', 'health_note': '≤ 1 дефект на 100 услуг (99% бездефектных)'},
                {'id': '8.3', 'question': 'Стоимость несоответствия (внешний брак) в % от выручки', 'inputs': [{'label': 'Стоимость несоответствия (тыс. руб.)', 'hint': 'Переделки, компенсации, штрафы', 'type': 'number', 'unit': 'тыс. руб.'}, {'label': 'Выручка (тыс. руб.)', 'hint': 'Выручка за период', 'type': 'number', 'unit': 'тыс. руб.'}], 'formula': '(Стоимость несоответствия / Выручка) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель службы качества / CX', 'health_threshold': 3, 'health_comparison': 'lte', 'health_note': 'Стоимость брака ≤ 3% выручки (Crosby)'},
                {'id': '8.4', 'question': 'Индекс лояльности NPS по регулярному опросу', 'inputs': [{'label': 'Промоутеры (%)', 'hint': 'Оценка 9–10 баллов', 'type': 'number'}, {'label': 'Критики (%)', 'hint': 'Оценка 0–6 баллов', 'type': 'number'}], 'formula': 'Промоутеры − Критики', 'calc_type': 'subtraction', 'responsible': 'Руководитель службы качества / CX', 'health_threshold': 50, 'health_comparison': 'gte', 'health_note': 'NPS ≥ 50 (лидеры услуг)'},
                {'id': '8.5', 'question': 'Среднее время от рекламации до закрытия CAPA (дни)', 'inputs': [{'label': 'Среднее время закрытия CAPA (дней)', 'hint': 'От регистрации до закрытия корректирующих действий', 'type': 'number', 'unit': 'дн.'}], 'formula': 'Σ(Закрытие CAPA − Регистрация) / Кол-во', 'calc_type': 'value', 'responsible': 'Руководитель службы качества / CX', 'health_threshold': 30, 'health_comparison': 'lte', 'health_note': 'Закрытие CAPA ≤ 30 дней (ISO 9001)'},
                {'id': '8.6', 'question': 'Доля плановых внутренних аудитов, проведённых в срок', 'inputs': [{'label': 'Аудитов по графику', 'hint': 'Выполнены в соответствии с графиком', 'type': 'number'}, {'label': 'Всего запланированных аудитов', 'hint': 'По графику за 6 мес.', 'type': 'number'}], 'formula': '(По графику / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель службы качества / CX', 'health_threshold': 100, 'health_comparison': 'gte', 'health_note': '100% аудитов в срок (ISO 9001)'},
                {'id': '8.7', 'question': 'Наличие действующего сертификата СМК (ISO 9001 и т.п.)', 'inputs': [{'label': 'Сертификат СМК действует', 'hint': 'Срок действия не истёк', 'type': 'yesno'}], 'formula': 'Сертификат существует и действует', 'calc_type': 'yesno', 'responsible': 'Руководитель службы качества / CX', 'health_threshold': 'yes', 'health_comparison': 'eq', 'health_note': 'Действующий сертификат СМК (Да)'},
                {'id': '8.8', 'question': 'Доля ключевых процессов с отслеживаемыми KPI качества', 'inputs': [{'label': 'Процессов с KPI качества', 'hint': 'KPI утверждены и измеряются', 'type': 'number'}, {'label': 'Всего ключевых процессов', 'hint': 'Ключевые сервисные процессы', 'type': 'number'}], 'formula': '(С KPI / Всего) × 100%', 'calc_type': 'division_percent', 'responsible': 'Руководитель службы качества / CX', 'health_threshold': 100, 'health_comparison': 'gte', 'health_note': '100% ключевых процессов с KPI качества'},
            ],
            'responsible_list': ['Руководитель службы качества / CX', 'Специалист по качеству', 'Другое'],
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
