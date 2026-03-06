from pathlib import Path


def test_app_layer_does_not_import_poi_repository() -> None:
    app_root = Path("app")
    for path in app_root.rglob("*.py"):
        if path.name == "poi_repository.py":
            continue
        text = path.read_text(encoding="utf-8")
        assert "from app.repositories import poi_repository" not in text
        assert "import app.repositories.poi_repository" not in text
        assert "poi_repository." not in text

