"""
FocusFlow Backend API Tests
Tests health, auth, content, sessions, and user data isolation.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.mongo import db_manager

# Module-level client (no lifespan — used for simple tests)
client = TestClient(app)


def _has_db() -> bool:
    """Return True if MongoDB is connected and available."""
    return db_manager.db is not None


# ─── Health (no DB required) ──────────────────────────────────────────────────

def test_health_endpoint():
    """Verify health endpoint returns 200 OK and expected structure (no DB required)."""
    # Use plain TestClient — no lifespan trigger, so MongoDB won't be connected.
    # Health endpoint gracefully handles disconnected DB.
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["app"] == "FocusFlow"
    assert "database" in data
    assert "simulation_mode" in data

# ─── Auth Validation (no DB needed for 422/400 responses) ────────────────────

def test_registration_validation():
    """Verify registration rejects clearly invalid inputs at validation layer."""
    # Short password (< 8 chars)
    resp = client.post("/api/auth/register", json={
        "email": "valid@example.com",
        "password": "123",
        "display_name": "משתמש"
    })
    assert resp.status_code in (422, 400)

    # Invalid email
    resp = client.post("/api/auth/register", json={
        "email": "not-an-email",
        "password": "password123",
        "display_name": "משתמש"
    })
    assert resp.status_code in (422, 400)

def test_unauthenticated_protected_endpoints():
    """Verify that protected endpoints reject requests without a valid token."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401

    resp = client.get("/api/content")
    assert resp.status_code == 401

    resp = client.get("/api/sessions")
    assert resp.status_code == 401

# ─── Full Flow Tests (require MongoDB) ───────────────────────────────────────

def _register_and_login(client: TestClient, email: str, name: str) -> tuple[str, dict]:
    """Helper: register a user and return (token, user_data)."""
    resp = client.post("/api/auth/register", json={
        "email": email,
        "password": "testpass123",
        "display_name": name,
    })
    assert resp.status_code == 201, f"Register failed: {resp.text}"
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["display_name"] == name
    return data["access_token"], data["user"]


@pytest.mark.requires_db
def test_register_and_login(test_client: TestClient):
    """Full register → login cycle with correct display_name."""
    if not _has_db():
        pytest.skip("MongoDB not available")

    token, user = _register_and_login(test_client, "flow_test1@focusflow.test", "אלי")
    assert user["email"] == "flow_test1@focusflow.test"
    assert user["display_name"] == "אלי"
    assert token != ""

    # Login with same credentials
    resp = test_client.post("/api/auth/login", json={
        "email": "flow_test1@focusflow.test",
        "password": "testpass123",
    })
    assert resp.status_code == 200
    assert resp.json()["user"]["display_name"] == "אלי"

    # /me returns correct user
    me_resp = test_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["display_name"] == "אלי"


@pytest.mark.requires_db
def test_duplicate_email_rejected(test_client: TestClient):
    """Duplicate registration returns 400."""
    if not _has_db():
        pytest.skip("MongoDB not available")

    _register_and_login(test_client, "dup_test@focusflow.test", "כפיל")
    resp = test_client.post("/api/auth/register", json={
        "email": "dup_test@focusflow.test",
        "password": "testpass123",
        "display_name": "כפיל2",
    })
    assert resp.status_code == 400


@pytest.mark.requires_db
def test_content_and_session_lifecycle(test_client: TestClient):
    """Create content → start session → add readings → end session → verify in list."""
    if not _has_db():
        pytest.skip("MongoDB not available")

    token, _ = _register_and_login(test_client, "lifecycle@focusflow.test", "מרים")
    auth = {"Authorization": f"Bearer {token}"}

    # Create content
    create_resp = test_client.post("/api/content", headers=auth, json={
        "title": "מאמר בדיקה",
        "content_type": "text",
        "text": "זהו טקסט בדיקה לסשן למידה.",
    })
    assert create_resp.status_code == 201
    content_id = create_resp.json()["id"]

    # List content
    list_resp = test_client.get("/api/content", headers=auth)
    assert list_resp.status_code == 200
    assert any(c["id"] == content_id for c in list_resp.json())

    # Start session
    sess_resp = test_client.post("/api/sessions", headers=auth, json={"content_id": content_id})
    assert sess_resp.status_code == 201
    session = sess_resp.json()
    session_id = session["id"]
    assert session["status"] == "active"
    assert session["average_attention"] is None

    # Add 5 readings
    for i in range(5):
        r = test_client.post(f"/api/sessions/{session_id}/readings", headers=auth, json={
            "timestamp": f"2025-01-01T10:00:{10 + i:02d}Z",
            "attention_score": round(0.70 + i * 0.02, 2),
            "face_detected": True,
            "prediction_source": "trained_neural_network_simulation",
        })
        assert r.status_code == 201

    # End session
    end_resp = test_client.post(f"/api/sessions/{session_id}/end", headers=auth)
    assert end_resp.status_code == 200
    ended = end_resp.json()
    assert ended["status"] == "completed"
    assert ended["valid_readings_count"] == 5
    assert ended["average_attention"] is not None
    expected_avg = round((0.70 + 0.72 + 0.74 + 0.76 + 0.78) / 5, 3)
    assert abs(ended["average_attention"] - expected_avg) < 0.01

    # Session appears in list
    list_sess = test_client.get("/api/sessions", headers=auth)
    assert list_sess.status_code == 200
    assert any(s["id"] == session_id for s in list_sess.json())

    # Session detail includes readings
    detail = test_client.get(f"/api/sessions/{session_id}", headers=auth)
    assert detail.status_code == 200
    assert len(detail.json().get("readings", [])) == 5


@pytest.mark.requires_db
def test_user_data_isolation(test_client: TestClient):
    """User A cannot see User B's sessions or content."""
    if not _has_db():
        pytest.skip("MongoDB not available")

    token_a, _ = _register_and_login(test_client, "user_a_iso@focusflow.test", "עמיר")
    token_b, _ = _register_and_login(test_client, "user_b_iso@focusflow.test", "בלה")
    auth_a = {"Authorization": f"Bearer {token_a}"}
    auth_b = {"Authorization": f"Bearer {token_b}"}

    # User A creates content
    content_a = test_client.post("/api/content", headers=auth_a, json={
        "title": "תוכן של A",
        "content_type": "text",
        "text": "תוכן פרטי של משתמש A",
    })
    assert content_a.status_code == 201
    content_a_id = content_a.json()["id"]

    # User B cannot access user A's content
    resp = test_client.get(f"/api/content/{content_a_id}", headers=auth_b)
    assert resp.status_code in (403, 404)

    # User B's content list doesn't contain A's content
    b_list = test_client.get("/api/content", headers=auth_b)
    assert b_list.status_code == 200
    assert not any(c["id"] == content_a_id for c in b_list.json())

    # User A starts a session
    sess_a = test_client.post("/api/sessions", headers=auth_a, json={"content_id": content_a_id})
    assert sess_a.status_code == 201
    session_a_id = sess_a.json()["id"]

    # User B cannot see session A
    resp_b = test_client.get(f"/api/sessions/{session_a_id}", headers=auth_b)
    assert resp_b.status_code in (403, 404)

    # User B's session list does not contain session A
    b_sessions = test_client.get("/api/sessions", headers=auth_b)
    assert b_sessions.status_code == 200
    assert not any(s["id"] == session_a_id for s in b_sessions.json())


@pytest.mark.requires_db
def test_no_face_readings_excluded_from_average(test_client: TestClient):
    """Readings with face_detected=False must not affect average_attention."""
    if not _has_db():
        pytest.skip("MongoDB not available")

    token, _ = _register_and_login(test_client, "noface@focusflow.test", "דן")
    auth = {"Authorization": f"Bearer {token}"}

    content = test_client.post("/api/content", headers=auth, json={
        "title": "תוכן ללא פנים",
        "content_type": "text",
        "text": "בדיקת חישוב ממוצע ללא פנים.",
    })
    content_id = content.json()["id"]
    sess = test_client.post("/api/sessions", headers=auth, json={"content_id": content_id})
    session_id = sess.json()["id"]

    # Two valid face readings
    test_client.post(f"/api/sessions/{session_id}/readings", headers=auth, json={
        "timestamp": "2025-01-01T10:00:01Z",
        "attention_score": 0.8,
        "face_detected": True,
        "prediction_source": "simulation",
    })
    test_client.post(f"/api/sessions/{session_id}/readings", headers=auth, json={
        "timestamp": "2025-01-01T10:00:02Z",
        "attention_score": 0.6,
        "face_detected": True,
        "prediction_source": "simulation",
    })
    # One no-face reading — should NOT affect average
    test_client.post(f"/api/sessions/{session_id}/readings", headers=auth, json={
        "timestamp": "2025-01-01T10:00:03Z",
        "attention_score": None,
        "face_detected": False,
        "prediction_source": "simulation",
    })

    end_resp = test_client.post(f"/api/sessions/{session_id}/end", headers=auth)
    assert end_resp.status_code == 200
    ended = end_resp.json()
    assert ended["valid_readings_count"] == 2
    assert ended["total_readings_count"] == 3
    assert abs(ended["average_attention"] - 0.7) < 0.01
