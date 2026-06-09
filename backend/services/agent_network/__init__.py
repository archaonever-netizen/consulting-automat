"""Сеть ИИ-агентов на LangGraph (executor / consumer / supplier).

Узлы графа = отделы (`Department`), рёбра = `FunctionDepartmentLink`. См.
ARCHITECTURE_AGENTS.md. Это v2 поверх существующего LCEL-конвейера
(`orchestrator_service.py`), который остаётся как v1/фолбэк.
"""
from .graph import build_graph
from .runner import run_network, stream_network
from .state import AgentNetworkState
from .topology import load_topology

__all__ = [
    "build_graph",
    "run_network",
    "stream_network",
    "AgentNetworkState",
    "load_topology",
]
