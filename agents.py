# agents.py
"""Инстанцирование всех функциональных ИИ-советников и главного координатора."""

from function_agent import FunctionAgent
from orchestrator import Orchestrator
from models import Function, db


def initialize_agents():
    """Инициализировать агентов из БД и вернуть orchestrator."""
    from app import app

    with app.app_context():
        functions = Function.query.all()

        agents = {}
        for func in functions:
            try:
                agent = FunctionAgent(func, db)
                agents[func.name] = agent
            except Exception as e:
                print(f"Error initializing agent for {func.name}: {e}")

        orchestrator = Orchestrator(agents, db)

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
