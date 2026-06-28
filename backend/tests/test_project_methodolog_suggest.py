from backend.services.project_methodolog import _sanitize_hypotheses


def test_sanitize_keeps_valid_and_trims():
    raw = {
        "hypotheses": [
            {"name": "Скорость", "statement": "если..то..потому что", "source": "стратегический выбор", "expectedEffect": "рост выручки"},
            {"name": "", "statement": ""},  # пустая — отбрасывается
            {"name": "Только имя"},
            "не словарь",  # мусор — отбрасывается
        ]
    }
    out = _sanitize_hypotheses(raw)
    assert [h["name"] for h in out] == ["Скорость", "Только имя"]
    assert out[0]["statement"] == "если..то..потому что"
    assert out[0]["source"] == "стратегический выбор"


def test_sanitize_handles_non_dict_and_missing():
    assert _sanitize_hypotheses(None) == []
    assert _sanitize_hypotheses({}) == []
    assert _sanitize_hypotheses({"hypotheses": None}) == []


def test_sanitize_caps_at_eight():
    raw = {"hypotheses": [{"name": f"H{i}", "statement": "s"} for i in range(20)]}
    assert len(_sanitize_hypotheses(raw)) == 8


def test_sanitize_truncates_long_fields():
    raw = {"hypotheses": [{"name": "x" * 500, "statement": "y" * 1000}]}
    out = _sanitize_hypotheses(raw)
    assert len(out[0]["name"]) == 160
    assert len(out[0]["statement"]) == 600
