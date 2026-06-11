"""Проводка API: приложение поднимается и роуты целей зарегистрированы.

Заодно проверяет, что вся цепочка импортов (routes→service→engine→llm) валидна.
БД и сеть не задействуются — только инспекция app.routes.
"""

def test_goals_routes_registered():
    from backend.main import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/api/goals" in paths
    assert "/api/goals/{goal_id}" in paths
    assert "/api/goals/{goal_id}/decompose" in paths
    assert "/api/goals/{goal_id}/recalculate" in paths
    assert "/api/goals/{goal_id}/periods/{period_id}/approve" in paths
    assert "/api/goals/{goal_id}/assumptions/{assumption_id}/confirm" in paths
