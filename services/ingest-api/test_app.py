import pytest
from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c
    from app import events_store
    events_store.clear()


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"
    assert data["service"] == "ingest-api"
    assert "timestamp" in data


def test_ingest_event(client):
    resp = client.post("/events", json={"type": "click", "payload": {"x": 10}, "source": "web"})
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["type"] == "click"
    assert data["source"] == "web"
    assert "id" in data
    assert "ingested_at" in data


def test_ingest_event_missing_type(client):
    resp = client.post("/events", json={"payload": {"x": 10}})
    assert resp.status_code == 400
    assert "type" in resp.get_json()["error"]


def test_ingest_event_invalid_json(client):
    resp = client.post("/events", data="not json", content_type="application/json")
    assert resp.status_code == 400


def test_list_events(client):
    client.post("/events", json={"type": "click", "source": "web"})
    client.post("/events", json={"type": "view", "source": "mobile"})
    resp = client.get("/events")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["count"] == 2


def test_list_events_filter_type(client):
    client.post("/events", json={"type": "click", "source": "web"})
    client.post("/events", json={"type": "view", "source": "mobile"})
    resp = client.get("/events?type=click")
    data = resp.get_json()
    assert data["count"] == 1
    assert data["events"][0]["type"] == "click"


def test_list_events_filter_source(client):
    client.post("/events", json={"type": "click", "source": "web"})
    client.post("/events", json={"type": "view", "source": "mobile"})
    resp = client.get("/events?source=mobile")
    data = resp.get_json()
    assert data["count"] == 1
    assert data["events"][0]["source"] == "mobile"


def test_clear_events(client):
    client.post("/events", json={"type": "click"})
    client.post("/events", json={"type": "view"})
    resp = client.delete("/events")
    assert resp.status_code == 200
    assert resp.get_json()["cleared"] == 2
    resp = client.get("/events")
    assert resp.get_json()["count"] == 0
