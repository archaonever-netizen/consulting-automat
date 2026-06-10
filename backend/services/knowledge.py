"""Сервис Базы знаний: CRUD, дайджест для ИИ и первичный сид контента.

Контент Базы знаний предназначен и для людей (рендер в UI), и для ИИ-помощников.
`build_ai_digest` собирает опубликованные статьи с ai_visible=true в компактный
Markdown, который внедряется в системный промпт чата и доступен сети агентов.
"""
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import KnowledgeCategory, KnowledgeArticle

# Предел длины дайджеста, чтобы не раздувать промпт ИИ.
_DIGEST_MAX_CHARS = 7000


async def list_tree(db: AsyncSession, *, published_only: bool = False) -> list[KnowledgeCategory]:
    """Все разделы с вложенными статьями, отсортированные по sort_order."""
    result = await db.execute(
        select(KnowledgeCategory)
        .options(selectinload(KnowledgeCategory.articles))
        .order_by(KnowledgeCategory.sort_order, KnowledgeCategory.id)
    )
    categories = list(result.scalars().all())
    if published_only:
        for cat in categories:
            cat.articles = [a for a in cat.articles if a.is_published]
    return categories


async def build_ai_digest(db: AsyncSession) -> str:
    """Скомпоновать Markdown-дайджест Базы знаний для ИИ-помощников.

    Включает только опубликованные статьи с ai_visible=true. Ограничен по длине.
    Возвращает пустую строку, если знаний нет.
    """
    categories = await list_tree(db, published_only=True)
    lines: list[str] = []
    for cat in categories:
        articles = [a for a in cat.articles if a.ai_visible]
        if not articles:
            continue
        lines.append(f"## {cat.title}")
        for a in sorted(articles, key=lambda x: x.sort_order):
            head = f"### {a.title}"
            if a.summary:
                head += f"\n{a.summary.strip()}"
            lines.append(head)
            if a.body:
                lines.append(a.body.strip())
        lines.append("")

    digest = "\n".join(lines).strip()
    if len(digest) > _DIGEST_MAX_CHARS:
        digest = digest[:_DIGEST_MAX_CHARS].rstrip() + "\n…"
    return digest


# ── CRUD: разделы ───────────────────────────────────────────
async def create_category(db: AsyncSession, **fields) -> KnowledgeCategory:
    cat = KnowledgeCategory(**fields)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


async def update_category(db: AsyncSession, category_id: int, fields: dict) -> KnowledgeCategory | None:
    cat = await db.get(KnowledgeCategory, category_id)
    if cat is None:
        return None
    for k, v in fields.items():
        setattr(cat, k, v)
    await db.commit()
    await db.refresh(cat)
    return cat


async def delete_category(db: AsyncSession, category_id: int) -> bool:
    cat = await db.get(KnowledgeCategory, category_id)
    if cat is None:
        return False
    await db.delete(cat)
    await db.commit()
    return True


# ── CRUD: статьи ────────────────────────────────────────────
async def create_article(db: AsyncSession, *, created_by_id: int | None = None, **fields) -> KnowledgeArticle:
    art = KnowledgeArticle(created_by_id=created_by_id, **fields)
    db.add(art)
    await db.commit()
    await db.refresh(art)
    return art


async def update_article(db: AsyncSession, article_id: int, fields: dict) -> KnowledgeArticle | None:
    art = await db.get(KnowledgeArticle, article_id)
    if art is None:
        return None
    for k, v in fields.items():
        setattr(art, k, v)
    await db.commit()
    await db.refresh(art)
    return art


async def delete_article(db: AsyncSession, article_id: int) -> bool:
    art = await db.get(KnowledgeArticle, article_id)
    if art is None:
        return False
    await db.delete(art)
    await db.commit()
    return True


# ── Первичный сид ───────────────────────────────────────────
async def seed_if_empty(db: AsyncSession) -> None:
    """Засеять Базу знаний стартовым контентом, если она пуста (идемпотентно)."""
    count = await db.scalar(select(func.count()).select_from(KnowledgeCategory))
    if count and count > 0:
        return

    for cat_def in _SEED:
        cat = KnowledgeCategory(
            key=cat_def["key"],
            title=cat_def["title"],
            icon_key=cat_def.get("icon_key"),
            layout=cat_def.get("layout", "cards"),
            sort_order=cat_def["sort_order"],
            description=cat_def.get("description"),
        )
        db.add(cat)
        await db.flush()  # получить cat.id
        for i, art in enumerate(cat_def["articles"]):
            db.add(KnowledgeArticle(
                category_id=cat.id,
                title=art["title"],
                summary=art.get("summary"),
                body=art.get("body"),
                icon_key=art.get("icon_key"),
                route=art.get("route"),
                sort_order=i,
            ))
    await db.commit()


def _points(items: list[str]) -> str:
    return "\n".join(f"- {it}" for it in items)


def _steps(items: list[str]) -> str:
    return "\n".join(f"{i + 1}. {it}" for i, it in enumerate(items))


_SEED = [
    {
        "key": "ui", "title": "Разделы интерфейса", "icon_key": "grid",
        "layout": "cards", "sort_order": 0,
        "description": "Что делает каждый раздел приложения и как им пользоваться.",
        "articles": [
            {"title": "Главная", "icon_key": "home", "route": "/",
             "summary": "Сводка дня от ШЕФ: что важно сделать, фокус по клиентам и состояние портфеля.",
             "body": _points([
                 "Сводка: сколько клиентов просмотрено и у скольких остались незаполненные брифы.",
                 "«Сегодня в фокусе» — клиенты с незаполненными брифами и быстрый переход в карточку.",
                 "Портфель: число клиентов, средний прогресс брифов, сколько брифов заполнено.",
                 "Поле «Спросите ШЕФ» и чипсы-подсказки открывают ИИ-чат с готовым вопросом.",
             ])},
            {"title": "ИИ-Чат", "icon_key": "chat", "route": "/chat",
             "summary": "Диалог с ШЕФ в три колонки: задачи слева, переписка в центре, подчаты справа.",
             "body": _points([
                 "Подчаты — параллельные ветки (версии) одной сессии, каждая со счётчиком токенов.",
                 "Сообщения стримятся в реальном времени (SSE).",
                 "Задачу можно создать прямо из чата и привязать к подчату.",
                 "Ответы поддерживают Markdown.",
             ])},
            {"title": "Клиенты", "icon_key": "users", "route": "/clients",
             "summary": "Картотека бизнесов под управлением. ИИ отслеживает состояние и подсказывает следующий шаг.",
             "body": _points([
                 "По каждому клиенту — Health-показатель и статус.",
                 "Переход в карточку клиента из списка или из блока «В фокусе» на Главной.",
             ])},
            {"title": "Карточка клиента", "icon_key": "doc",
             "summary": "Детальная страница клиента с вкладками: Обзор, Брифы, Документы, Аналитика, Задачи.",
             "body": _points([
                 "Кольцо прогресса брифов и Health-показатель в шапке.",
                 "Действия: «Завершить брифинг» и «Запустить Сеть агентов».",
                 "Типы брифов: Продажи, Бизнес-портрет, Точка А, Документация. Создавать пока можно только «Продажи».",
             ])},
            {"title": "Сеть агентов", "icon_key": "sparkle", "route": "/orchestration",
             "summary": "Запуск анализа компании клиента сетью ИИ-агентов с живым прогрессом.",
             "body": _points([
                 "Выбираете клиента и описываете проект/задачу.",
                 "Два режима: network (сеть агентов на LangGraph) и pipeline (старый LCEL-конвейер, фолбэк).",
                 "Live-прогресс (trace): видно, какой отдел работает прямо сейчас.",
                 "Итог — консолидированный план по функциям компании.",
             ])},
            {"title": "Задачи", "icon_key": "check", "route": "/tasks",
             "summary": "Список задач с детальным просмотром и статусами.",
             "body": _points([
                 "Статусы: В ожидании, В процессе, Завершена, Ошибка.",
                 "Поля задачи: цель, описание действия, ожидаемый результат, время начала и длительность.",
                 "Каждая задача привязана к клиенту.",
             ])},
            {"title": "Компания", "icon_key": "chart", "route": "/company",
             "summary": "Организационная структура: матрица функций и отделов компании. Доступно только основателю.",
             "body": _points([
                 "Функции (Техническая, Коммерческая и т.д.) и отделы.",
                 "Связи отделов с функциями по ролям executor / consumer / supplier.",
             ])},
        ],
    },
    {
        "key": "arch", "title": "Сеть агентов и архитектура", "icon_key": "sparkle",
        "layout": "list", "sort_order": 1,
        "description": "Как устроена сеть ИИ-агентов под капотом.",
        "articles": [
            {"title": "Идея",
             "body": "Каждый отдел компании получает собственного ИИ-агента. Агенты общаются как живые коллеги: потребитель (consumer) просит исполнителя (executor), а тот при нехватке данных идёт к своим поставщикам (supplier). Получается сеть помощников, которые перекидывают друг другу подзадачи и собирают общий результат — а пользователь видит живой прогресс."},
            {"title": "Роли отдела относительно функции",
             "body": "Рёбра графа берутся из связей «функция — отдел»:\n\n" + _points([
                 "**executor** — отдел, который выполняет функцию.",
                 "**consumer** — отдел, который потребляет результат функции.",
                 "**supplier** — отдел, который что-то поставляет для функции.",
             ])},
            {"title": "Два слоя",
             "body": "**Макро-слой** — граф отделов на LangGraph: узел = агент отдела, по графу ходят запросы consumer → executor → supplier. **Микро-слой** — внутренности узла: либо детерминированные фреймворки функции (SWOT, реестр рисков, чек-лист, RACI), либо маленький агент с тулзами только своего отдела."},
            {"title": "Три узла графа",
             "body": "Поток управления внутри сети:\n\n" + _points([
                 "**router** — по описанию проекта определяет стартовые функции и их executor-отделы.",
                 "**department_agent** — обрабатывает очередь запросов; при нехватке данных рекурсивно идёт к supplier’ам.",
                 "**consolidator** — когда очередь пуста, собирает результаты в итоговый план.",
             ])},
            {"title": "Безопасность и прогресс",
             "body": "Циклы A→B→A гасятся множеством visited и лимитом глубины (recursion_limit) — готовый результат переиспользуется. Ход прогона пишется в trace и стримится на фронт через SSE — это и есть живой прогресс. Подробности — в ARCHITECTURE_AGENTS.md."},
        ],
    },
    {
        "key": "scenarios", "title": "Сценарии и гайды", "icon_key": "bolt",
        "layout": "cards", "sort_order": 2,
        "description": "Пошаговые сценарии типовых задач.",
        "articles": [
            {"title": "Добавить клиента и заполнить бриф", "icon_key": "users",
             "body": _steps([
                 "Откройте раздел «Клиенты» и добавьте нового клиента.",
                 "Зайдите в карточку клиента → вкладка «Брифы».",
                 "Создайте бриф «Продажи» и заполните 12 ключевых метрик.",
                 "Следите за Health-показателем и прогрессом по кольцу в шапке.",
             ])},
            {"title": "Запустить Сеть агентов и получить план", "icon_key": "sparkle",
             "body": _steps([
                 "Откройте раздел «Сеть агентов» (или кнопку «Запустить Сеть агентов» в карточке клиента).",
                 "Выберите клиента и опишите проект/задачу.",
                 "Выберите режим network и запустите прогон.",
                 "Наблюдайте live-прогресс по отделам, затем изучите консолидированный план.",
             ])},
            {"title": "Работа в ИИ-чате с подчатами", "icon_key": "chat",
             "body": _steps([
                 "Откройте «ИИ-Чат» или нажмите «Новый чат» в боковом меню.",
                 "Задайте вопрос ШЕФ — ответ придёт потоком.",
                 "Создавайте подчаты справа, чтобы вести параллельные ветки одной темы.",
                 "При необходимости создайте задачу прямо из чата.",
             ])},
        ],
    },
    {
        "key": "glossary", "title": "Глоссарий", "icon_key": "book",
        "layout": "glossary", "sort_order": 3,
        "description": "Определения ключевых понятий.",
        "articles": [
            {"title": "ШЕФ", "summary": "ИИ-ассистент платформы консалтинга, который ведёт сводки, чат и анализ."},
            {"title": "Бриф", "summary": "Структурированная анкета по направлению: Продажи, Бизнес-портрет, Точка А, Документация."},
            {"title": "Health-показатель", "summary": "Оценка состояния клиента по заполненности и метрикам брифов."},
            {"title": "Клиент", "summary": "Бизнес под управлением; хранится в картотеке раздела «Клиенты»."},
            {"title": "Функция", "summary": "Функция компании (Техническая, Коммерческая и т.п.) в матрице раздела «Компания»."},
            {"title": "Отдел", "summary": "Подразделение, которое исполняет, потребляет или поставляет функции."},
            {"title": "executor / consumer / supplier", "summary": "Роли отдела относительно функции: выполняет / потребляет результат / поставляет вход."},
            {"title": "Сеть агентов", "summary": "Граф ИИ-агентов отделов на LangGraph; агенты обмениваются подзадачами по рёбрам графа."},
            {"title": "Оркестрация (прогон)", "summary": "Запуск анализа компании сетью агентов; хранит ход (trace) и итоговый результат (OrchestrationRun)."},
            {"title": "router / department_agent / consolidator", "summary": "Узлы графа: определение старта / обработка очереди / сборка итогового плана."},
            {"title": "Режим network / pipeline", "summary": "network — сеть агентов на LangGraph; pipeline — старый LCEL-конвейер, остаётся как фолбэк."},
            {"title": "Подчат", "summary": "Ветка (версия) внутри сессии ИИ-чата со своим счётчиком токенов."},
            {"title": "LangGraph", "summary": "Надстройка над LangChain для графов агентов с состоянием, циклами и стримингом прогресса."},
            {"title": "Trace", "summary": "Лог шагов прогона, который стримится на фронт (SSE) и показывает живой прогресс."},
        ],
    },
]
