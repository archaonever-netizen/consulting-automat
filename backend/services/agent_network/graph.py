"""Сборка StateGraph сети агентов: узлы, рёбра, компиляция."""
from langgraph.graph import END, START, StateGraph

from .nodes import (
    consolidator_node,
    department_agent_node,
    route_after_agent,
    router_node,
)
from .state import AgentNetworkState

_AGENT = "department_agent"
_CONSOLIDATOR = "consolidator"


def build_graph():
    """Скомпилировать граф сети агентов.

    START → router → (department_agent ⟲ пока очередь непуста) → consolidator → END
    """
    graph = StateGraph(AgentNetworkState)
    graph.add_node("router", router_node)
    graph.add_node(_AGENT, department_agent_node)
    graph.add_node(_CONSOLIDATOR, consolidator_node)

    graph.add_edge(START, "router")
    # router мог не поставить ни одного запроса (все функции без executor) → сразу в consolidator
    graph.add_conditional_edges("router", route_after_agent, {
        _AGENT: _AGENT,
        _CONSOLIDATOR: _CONSOLIDATOR,
    })
    # условное ребро: цикл обработки очереди либо выход на консолидацию
    graph.add_conditional_edges(_AGENT, route_after_agent, {
        _AGENT: _AGENT,
        _CONSOLIDATOR: _CONSOLIDATOR,
    })
    graph.add_edge(_CONSOLIDATOR, END)

    return graph.compile()
