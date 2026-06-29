"""Сервис файлов-свидетельств проверок гипотез (services/check_evidence).

Сеть не трогаем: storage_client подменяется монкипатчем. Проверяем санитайзер имени,
построение/скоупинг пути (anti path-traversal) и обёртки upload/download/delete.
"""
import pytest

from backend.services import check_evidence as svc


def test_safe_name_strips_unsafe_and_truncates():
    assert svc.safe_name("report v2.PDF") == "report_v2.PDF"  # пробел → _
    assert svc.safe_name("файл.csv") == ".csv"               # кириллица вычищается
    assert svc.safe_name("") == "file"
    assert svc.safe_name("../../etc/passwd") == "....etcpasswd"  # точки ок, слэши срезаны
    assert len(svc.safe_name("a" * 500)) == 120


def test_evidence_prefix_and_segment_validation():
    assert svc.evidence_prefix(7, "12") == "project-7/checks/12/"
    with pytest.raises(ValueError):
        svc.evidence_prefix(7, "..")  # сегмент очищается до пустого → ошибка


def test_build_path_within_prefix_and_unique():
    p1 = svc.build_path(7, "12", "data.csv")
    p2 = svc.build_path(7, "12", "data.csv")
    assert p1.startswith("project-7/checks/12/")
    assert p1.endswith("__data.csv")
    assert p1 != p2  # uuid защищает от перезаписи


def test_is_within_scopes_to_project_and_check():
    path = svc.build_path(7, "12", "x.csv")
    assert svc.is_within(7, "12", path) is True
    assert svc.is_within(8, "12", path) is False  # другой проект
    assert svc.is_within(7, "99", path) is False  # другая проверка
    assert svc.is_within(7, "12", "project-7/checks/12/../../secret") is False
    assert svc.is_within(7, "12", "") is False


def test_upload_evidence_returns_metadata(monkeypatch):
    calls = {}
    monkeypatch.setattr(svc.storage_client, "ensure_bucket", lambda: "exists")

    def fake_upload(path, data, *, content_type="application/octet-stream"):
        calls["path"] = path
        calls["content_type"] = content_type
        return f"bucket/{path}"

    monkeypatch.setattr(svc.storage_client, "upload", fake_upload)

    meta = svc.upload_evidence(7, "12", "опрос.csv", b"a,b,c", "text/csv")
    assert meta["storagePath"].startswith("project-7/checks/12/")
    assert meta["filename"] == ".csv"
    assert meta["mime"] == "text/csv"
    assert meta["size"] == 5
    assert calls["content_type"] == "text/csv"
    assert calls["path"] == meta["storagePath"]


def test_download_and_delete_reject_out_of_scope(monkeypatch):
    monkeypatch.setattr(svc.storage_client, "download", lambda path: b"data")
    monkeypatch.setattr(svc.storage_client, "delete", lambda path: None)

    good = svc.build_path(7, "12", "x.csv")
    assert svc.download_evidence(7, "12", good) == b"data"
    svc.delete_evidence(7, "12", good)  # не бросает

    with pytest.raises(ValueError):
        svc.download_evidence(7, "12", "project-9/checks/12/evil")
    with pytest.raises(ValueError):
        svc.delete_evidence(7, "12", "project-9/checks/12/evil")


def test_filename_from_path():
    assert svc.filename_from_path("project-7/checks/12/abc123__report.pdf") == "report.pdf"
    assert svc.filename_from_path("project-7/checks/12/noprefix") == "noprefix"
