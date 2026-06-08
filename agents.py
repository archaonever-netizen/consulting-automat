# agents.py
"""Инстанцирование всех функциональных ИИ-советников и главного координатора."""

from function_agent import FunctionAgent
from orchestrator import Orchestrator
from models import Function, db

# Глобальный кэш
_orchestrator_cache = None
_agents_cache = None


def initialize_agents():
    """Инициализировать агентов из БД и вернуть orchestrator."""
    from app import app

    with app.app_context():
        print("[AGENTS] Initializing agents...")
        # Загружаем функции с eager loading для relationships
        from sqlalchemy.orm import joinedload
        functions = Function.query.options(
            joinedload(Function.links)  # 'links' это actual relationship, создаётся через backref
        ).all()
        print(f"[AGENTS] Found {len(functions)} functions in DB")

        agents = {}
        for func in functions:
            print(f"[AGENTS] Creating agent for function: {func.name}")
            print(f"[AGENTS]   Description: {func.description[:50] if func.description else 'EMPTY'}")
            try:
                # Форсируем загрузку всех relationships пока сессия ещё открыта
                _ = func.executor_link
                _ = func.consumer_links
                _ = func.supplier_links

                agent = FunctionAgent(func, db)
                agents[func.name] = agent
                print(f"[AGENTS] ✓ Agent created successfully")
            except Exception as e:
                print(f"[AGENTS] ✗ Error initializing agent for {func.name}: {e}")
                import traceback
                traceback.print_exc()

        print(f"[AGENTS] Total agents created: {len(agents)}")
        orchestrator = Orchestrator(agents, db)
        print("[AGENTS] Orchestrator created successfully")

        # Явно отделяем все объекты от сессии перед выходом из контекста
        # Это предотвращает ошибки "parent instance is not bound to a Session"
        db.session.expunge_all()

        return orchestrator, agents


def get_agent_by_function_name(function_name: str):
    """Получить агента по названию функции."""
    from app import app

    with app.app_context():
        func = Function.query.filter_by(name=function_name).first()
        if not func:
            return None

        try:
            return FunctionAgent(func, db)
        except Exception as e:
            print(f"Error creating agent: {e}")
            return None


def get_orchestrator():
    """Получить главный координатор (кэшированный)."""
    global _orchestrator_cache, _agents_cache

    if _orchestrator_cache is not None:
        print("[AGENTS] Using cached orchestrator")
        return _orchestrator_cache

    print("[AGENTS] Creating new orchestrator (not in cache)")
    orchestrator, agents = initialize_agents()
    _orchestrator_cache = orchestrator
    _agents_cache = agents
    return orchestrator
