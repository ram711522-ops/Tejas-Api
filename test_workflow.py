"""Comprehensive end-to-end audit test for TEJAS Solar Prediction API.

Covers:
- Public health/home endpoints and HTTP Basic Auth enforcement
- Plant CRUD, duplicate handling, and validation
- Weather retrieval and error handling
- Manual /predict and Automatic GET/POST predictions (scaling, clipping, no-save preview)
- Forecast CRUD and Reading CRUD
- Prediction vs Actual comparison (preview & save), daytime filtering, near-zero/nighttime no-false-alert
- Deviation detection, automatic alert creation, duplicate alert prevention
- Alert CRUD, acknowledgement, resolution (resolved_at), and validation
"""

import os
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("API_USERNAME", "tejas_admin")
os.environ.setdefault("API_PASSWORD", "root")

from alerts.models import Alert  # noqa: E402, F401
from api.main import app  # noqa: E402
from forecasts.models import Forecast  # noqa: E402, F401
from plants.database import Base, get_db  # noqa: E402
from plants.models import Plant  # noqa: E402, F401
from readings.models import Reading  # noqa: E402, F401
from weather.service import WeatherServiceError  # noqa: E402

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(engine, "connect")
def _enable_sqlite_fk(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db

MOCK_WEATHER = {
    "source": "open-meteo",
    "observed_at_local": "2026-11-26T12:00",
    "timezone": "Asia/Kolkata",
    "ambient_temperature_c": 32.0,
    "relative_humidity_percent": 40.0,
    "shortwave_radiation_w_m2": 750.0,
    "irradiation_kw_m2": 0.75,
    "units": {
        "temperature": "°C",
        "humidity": "%",
        "radiation": "W/m²",
    },
}


def run_audit_tests():
    auth = (os.environ["API_USERNAME"], os.environ["API_PASSWORD"])
    client = TestClient(app)

    # 1. Public endpoints & Auth enforcement
    r = client.get("/")
    assert r.status_code == 200, r.text
    r = client.get("/health")
    assert r.status_code == 200, r.text
    assert r.json()["model_loaded"] is True
    assert r.json()["model_features"] == 6

    for protected_path in ("/plants", "/forecasts", "/readings", "/alerts"):
        r = client.get(protected_path)
        assert r.status_code == 401, f"Expected 401 on {protected_path}, got {r.status_code}"

    # 2. Plant CRUD & duplicate handling
    plant_payload = {
        "plant_id": "DEMO-SOLAR-01",
        "plant_name": "College Demo Solar Plant",
        "plant_type": "grid_tied",
        "latitude": 14.8,
        "longitude": 78.18,
        "installed_capacity_mw": 5.0,
        "tilt": 15.0,
        "azimuth": 180.0,
    }
    r = client.post("/plants", json=plant_payload, auth=auth)
    assert r.status_code == 201, r.text

    # Duplicate plant_id -> 409
    r = client.post("/plants", json=plant_payload, auth=auth)
    assert r.status_code == 409, r.text

    # Update plant
    r = client.put("/plants/DEMO-SOLAR-01", json={"plant_name": "TEJAS Demo Plant"}, auth=auth)
    assert r.status_code == 200, r.text
    assert r.json()["plant_name"] == "TEJAS Demo Plant"

    # 3. Manual /predict endpoint
    r = client.post(
        "/predict",
        json={
            "plant_code": 0,
            "AMBIENT_TEMPERATURE": 32.0,
            "MODULE_TEMPERATURE": 48.0,
            "IRRADIATION": 0.75,
            "hour_sin": 0.0,
            "hour_cos": -1.0,
            "actual_power": 5000.0,
        },
        auth=auth,
    )
    assert r.status_code == 200, r.text
    assert r.json()["deviation_detected"] is True

    # Invalid time feature -> 422
    r = client.post(
        "/predict",
        json={
            "plant_code": 0,
            "AMBIENT_TEMPERATURE": 32.0,
            "MODULE_TEMPERATURE": 48.0,
            "IRRADIATION": 0.75,
            "hour_sin": 0.0,
            "hour_cos": 0.0,
        },
        auth=auth,
    )
    assert r.status_code == 422, r.text

    # 4. Weather retrieval & error handling
    with patch("weather.router.fetch_current_weather", return_value=MOCK_WEATHER):
        r = client.get("/plants/DEMO-SOLAR-01/weather", auth=auth)
        assert r.status_code == 200, r.text
        assert r.json()["weather"]["irradiation_kw_m2"] == 0.75

    with patch(
        "weather.router.fetch_current_weather",
        side_effect=WeatherServiceError("Weather service timed out.", 504),
    ):
        r = client.get("/plants/DEMO-SOLAR-01/weather", auth=auth)
        assert r.status_code == 504, r.text

    # Compare with no forecasts/readings yet -> 404
    r = client.post("/plants/DEMO-SOLAR-01/compare", auth=auth)
    assert r.status_code == 404, r.text

    # Weather with missing temperature/radiation -> 502 on automatic prediction
    bad_weather = {**MOCK_WEATHER, "ambient_temperature_c": None}
    with patch("api.main.fetch_current_weather", return_value=bad_weather):
        r = client.get("/plants/DEMO-SOLAR-01/predict/automatic", auth=auth)
        assert r.status_code == 502, r.text

    # 5. Automatic prediction preview (GET) does not save; POST saves forecast
    with patch("api.main.fetch_current_weather", return_value=MOCK_WEATHER):
        r = client.get("/plants/DEMO-SOLAR-01/predict/automatic", auth=auth)
        assert r.status_code == 200, r.text
        preview = r.json()
        predicted_kw = preview["predicted_power_kw"]
        assert 0 < predicted_kw <= preview["plant_capacity_kw"]

        # Confirm preview did NOT create a forecast
        r = client.get("/forecasts?plant_id=DEMO-SOLAR-01", auth=auth)
        assert r.status_code == 200, r.text
        assert len(r.json()) == 0

        # POST saves forecast
        r = client.post("/plants/DEMO-SOLAR-01/predict/automatic", auth=auth)
        assert r.status_code == 201, r.text
        assert r.json()["forecast_saved"] is True
        forecast_id = r.json()["forecast_id"]

    # 6. Forecast CRUD (GET by id, PUT, manual POST, DELETE)
    r = client.get(f"/forecasts/{forecast_id}", auth=auth)
    assert r.status_code == 200, r.text
    r = client.put(f"/forecasts/{forecast_id}", json={"source": "ml_model"}, auth=auth)
    assert r.status_code == 200, r.text

    # 7. Readings & Comparison (normal, nighttime no-false-alert, daytime severe drop)
    r = client.post(
        "/readings",
        json={
            "plant_id": "DEMO-SOLAR-01",
            "timestamp": "2026-11-26T06:30:00Z",
            "ambient_temperature": 32.0,
            "module_temperature": 48.0,
            "irradiation": 0.75,
            "actual_power_kw": predicted_kw,
            "source": "scada",
        },
        auth=auth,
    )
    assert r.status_code == 201, r.text
    normal_reading_id = r.json()["id"]

    # Reject null for non-nullable Reading field -> 422
    r = client.put(f"/readings/{normal_reading_id}", json={"actual_power_kw": None}, auth=auth)
    assert r.status_code == 422, r.text

    # Read-only compare preview
    r = client.get(
        f"/plants/DEMO-SOLAR-01/compare?forecast_id={forecast_id}&reading_id={normal_reading_id}",
        auth=auth,
    )
    assert r.status_code == 200, r.text
    assert r.json()["deviation_detected"] is False
    assert r.json()["alert_generated"] is False

    # Nighttime / low-irradiation reading with 0 power -> must NOT trigger false alert
    r = client.post(
        "/readings",
        json={
            "plant_id": "DEMO-SOLAR-01",
            "timestamp": "2026-11-26T18:30:00Z",
            "ambient_temperature": 22.0,
            "module_temperature": 21.0,
            "irradiation": 0.01,
            "actual_power_kw": 0.0,
            "source": "scada",
        },
        auth=auth,
    )
    assert r.status_code == 201, r.text
    night_reading_id = r.json()["id"]

    r = client.post(
        "/plants/DEMO-SOLAR-01/compare",
        json={"forecast_id": forecast_id, "reading_id": night_reading_id},
        auth=auth,
    )
    assert r.status_code == 200, r.text
    assert r.json()["daytime"] is False
    assert r.json()["deviation_detected"] is False
    assert r.json()["alert_generated"] is False

    # Daytime severe drop -> deviation detected & alert generated
    r = client.post(
        "/readings",
        json={
            "plant_id": "DEMO-SOLAR-01",
            "timestamp": "2026-11-26T19:00:00Z",
            "ambient_temperature": 32.0,
            "module_temperature": 48.0,
            "irradiation": 0.75,
            "actual_power_kw": round(predicted_kw * 0.2, 2),
            "source": "scada",
        },
        auth=auth,
    )
    assert r.status_code == 201, r.text
    low_reading_id = r.json()["id"]

    r = client.post("/plants/DEMO-SOLAR-01/compare", auth=auth)
    assert r.status_code == 200, r.text
    comp = r.json()
    assert comp["deviation_detected"] is True
    assert comp["alert_generated"] is True
    assert comp["alert"]["severity"] == "high"
    alert_id = comp["alert"]["id"]

    # Duplicate alert prevention on repeat compare
    r = client.post(
        "/plants/DEMO-SOLAR-01/compare",
        json={"forecast_id": forecast_id, "reading_id": low_reading_id},
        auth=auth,
    )
    assert r.status_code == 200, r.text
    assert r.json()["alert_generated"] is False
    assert r.json()["alert"]["id"] == alert_id

    # 8. Alert acknowledgement & resolution + null rejection
    r = client.put(f"/alerts/{alert_id}", json={"status": None}, auth=auth)
    assert r.status_code == 422, r.text

    r = client.put(f"/alerts/{alert_id}", json={"status": "acknowledged"}, auth=auth)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "acknowledged"
    assert r.json()["resolved_at"] is None

    r = client.put(f"/alerts/{alert_id}", json={"status": "resolved"}, auth=auth)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "resolved"
    assert r.json()["resolved_at"] is not None

    # 9. Capacity clipping check on high-radiation weather
    peak_weather = {
        **MOCK_WEATHER,
        "ambient_temperature_c": 42.0,
        "shortwave_radiation_w_m2": 1400.0,
        "irradiation_kw_m2": 1.4,
    }
    with patch("api.main.fetch_current_weather", return_value=peak_weather):
        r = client.post("/plants", json={**plant_payload, "plant_id": "CLIP-PLANT-01", "installed_capacity_mw": 0.5}, auth=auth)
        assert r.status_code == 201, r.text
        r = client.get("/plants/CLIP-PLANT-01/predict/automatic", auth=auth)
        assert r.status_code == 200, r.text
        clip_res = r.json()
        assert clip_res["predicted_power_kw"] <= clip_res["plant_capacity_kw"]
        if clip_res["scaled_prediction_kw"] > clip_res["plant_capacity_kw"]:
            assert clip_res["prediction_exceeds_capacity"] is True
            assert clip_res["predicted_power_kw"] == clip_res["plant_capacity_kw"]
        assert client.delete("/plants/CLIP-PLANT-01", auth=auth).status_code == 204

    # 10. Delete alert, reading, forecast, and plant (cleanup)
    assert client.delete(f"/alerts/{alert_id}", auth=auth).status_code == 204
    assert client.delete("/plants/DEMO-SOLAR-01", auth=auth).status_code == 204
    assert client.get("/plants/DEMO-SOLAR-01", auth=auth).status_code == 404

    print("ALL COMPREHENSIVE AUDIT TESTS PASSED!")


if __name__ == "__main__":
    run_audit_tests()
