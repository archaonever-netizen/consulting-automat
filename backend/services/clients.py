from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete
from sqlalchemy.orm import selectinload
from ..models import Client, Brief, OrchestrationRun, AIAnalysisCache
from ..schemas.clients import ClientCreate, ClientUpdate

# Спокойные приглушённые сланцевые тона (не яркие/разноцветные): аватары мягкие,
# различимы по оттенку, но единым спокойным семейством. Текст белый читается.
_PALETTE = ['#3B4252', '#434C5E', '#4C566A', '#41505F', '#4A4F5E', '#445163', '#3F4756']


def _brief_state(brief) -> str:
    if brief is None:
        return 'none'
    if brief.status == 'Заполнено':
        return 'done'
    if brief.status == 'В работе':
        return 'work'
    return 'none'


def _compute_client_list_item(c: Client) -> dict:
    bmap = {b.brief_type: b for b in c.briefs}
    done = sum(1 for b in bmap.values() if b.status == 'Заполнено')
    total = max(len(c.briefs), 1)
    parts = c.name.split()
    initials = (parts[0][0] + (parts[1][0] if len(parts) > 1 else '')).upper()
    color = _PALETTE[c.id % len(_PALETTE)]
    health = round(done / total * 100)

    if health == 100:
        health_label, health_cls = 'Хорошее', 'up'
    elif health >= 67:
        health_label, health_cls = 'В порядке', 'up'
    elif health >= 33:
        health_label, health_cls = 'В работе', 'warn'
    elif done > 0:
        health_label, health_cls = 'Внимание', 'down'
    else:
        health_label, health_cls = 'Нет данных', 'flat'

    circ = 113.1
    filled = round(health / 100 * circ, 1)

    return {
        "id": c.id,
        "name": c.name,
        "business_size": c.business_size or 'medium',
        "created_at": c.created_at,
        "initials": initials,
        "color": color,
        "done": done,
        "total": total,
        "health": health,
        "health_label": health_label,
        "health_cls": health_cls,
        "ring_filled": filled,
        "ring_empty": round(circ - filled, 1),
        "bd_briefing": _brief_state(bmap.get('briefing')),
        "bd_point_a": _brief_state(bmap.get('point_a')),
        "bd_docs": _brief_state(bmap.get('docs')),
    }


async def list_clients(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(Client)
        .options(selectinload(Client.briefs))
        .order_by(desc(Client.created_at))
    )
    clients = result.scalars().all()
    return [_compute_client_list_item(c) for c in clients]


async def create_client(db: AsyncSession, data: ClientCreate) -> Client:
    client = Client(name=data.name, business_size=data.business_size or 'medium')
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return client


async def get_client(db: AsyncSession, client_id: int) -> Client | None:
    result = await db.execute(
        select(Client)
        .where(Client.id == client_id)
        .options(selectinload(Client.briefs))
    )
    return result.scalar_one_or_none()


def _compute_client_detail(c: Client) -> dict:
    base = _compute_client_list_item(c)
    briefs_list = []
    for b in c.briefs:
        if b.status == 'Заполнено':
            status_label = 'Заполнено'
        elif b.status == 'В работе':
            status_label = 'В работе'
        else:
            status_label = 'Не заполнено'
        briefs_list.append({
            "id": b.id,
            "brief_type": b.brief_type,
            "status": status_label,
            "updated_at": b.updated_at.strftime('%d.%m.%Y') if b.updated_at else None,
        })
    base["briefs_list"] = briefs_list
    base["created_at_fmt"] = c.created_at.strftime('%d.%m.%Y') if c.created_at else "—"
    return base


async def get_client_detail(db: AsyncSession, client_id: int) -> dict | None:
    client = await get_client(db, client_id)
    if client is None:
        return None
    return _compute_client_detail(client)


async def get_home_data(db: AsyncSession) -> dict:
    result = await db.execute(
        select(Client)
        .options(selectinload(Client.briefs))
        .order_by(desc(Client.created_at))
    )
    clients = result.scalars().all()

    client_count = len(clients)
    total_briefs = sum(len(c.briefs) for c in clients)
    total_briefs_done = sum(
        1 for c in clients for b in c.briefs if b.status == 'Заполнено'
    )
    avg_health = (
        round(sum(
            _compute_client_list_item(c)['health'] for c in clients
        ) / client_count)
        if client_count > 0 else 0
    )

    focus_items = []
    for c in clients:
        item = _compute_client_list_item(c)
        if item['health'] < 100:
            focus_items.append(item)

    return {
        "client_count": client_count,
        "avg_health": avg_health,
        "total_briefs": total_briefs,
        "total_briefs_done": total_briefs_done,
        "focus_items": focus_items[:3],
    }


async def update_client(db: AsyncSession, client_id: int, data: ClientUpdate) -> Client | None:
    client = await get_client(db, client_id)
    if client is None:
        return None
    if data.name is not None:
        client.name = data.name
    if data.business_size is not None:
        client.business_size = data.business_size
    await db.commit()
    await db.refresh(client)
    return client


async def delete_client(db: AsyncSession, client_id: int) -> bool:
    client = await get_client(db, client_id)
    if client is None:
        return False
    # Эти таблицы ссылаются на clients.id без ondelete=CASCADE и не входят в
    # ORM-каскад Client, поэтому DELETE клиента иначе падает по внешнему ключу.
    # FunctionAnalysis удалится каскадом БД от orchestration_runs.
    await db.execute(delete(OrchestrationRun).where(OrchestrationRun.client_id == client_id))
    await db.execute(delete(AIAnalysisCache).where(AIAnalysisCache.client_id == client_id))
    await db.delete(client)
    await db.commit()
    return True
