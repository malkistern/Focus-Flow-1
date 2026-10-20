"""
Test configuration for FocusFlow backend.
Uses TestClient with the lifespan context manager so the app startup
(including the MongoDB connection attempt) runs properly.

If MongoDB is not available, the connection will fail silently (it uses
serverSelectionTimeoutMS=5000) and tests that require a live DB will be skipped.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.mongo import db_manager


@pytest.fixture(scope="session")
def test_client():
    """
    Provides a TestClient that runs the full app lifespan (startup/shutdown).
    This triggers the MongoDB connection attempt.
    """
    with TestClient(app, raise_server_exceptions=True) as client:
        yield client


def pytest_configure(config):
    """Register custom marks."""
    config.addinivalue_line("markers", "requires_db: mark test as requiring a live MongoDB connection")
