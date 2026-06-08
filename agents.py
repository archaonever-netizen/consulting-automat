# agents.py
"""Инстанцирование всех функциональных ИИ-советников и главного координатора."""

from function_agent import FunctionAgent
from orchestrator import Orchestrator
from models import Function, db


def initialize_agents():
    """Инициализировать агентов из БД и вернуть orchestrator."""
    from app import app

    with app.app_context():
        print("[AGENTS] Initializing agents...")
        functions = Function.query.all()
        print(f"[AGENTS] Found {len(functions)} functions in DB")

        agents = {}
        for func in functions:
            print(f"[AGENTS] Creating agent for function: {func.name}")
            print(f"[AGENTS]   Description: {func.description[:50] if func.description else 'EMPTY'}")
            try:
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
    """Получить главный координатор."""
    orchestrator, _ = initialize_agents()
    return orchestrator
