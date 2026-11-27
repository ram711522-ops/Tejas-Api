"""
Fetches current weather from Open-Meteo (no API key needed).
This file only talks to Open-Meteo. It does not touch the database.
"""

import logging
import math

import requests

logger = logging.getLogger("tejas.weather")

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
REQUEST_TIMEOUT_SECONDS = 10


class WeatherServiceError(Exception):
    """Raised for weather problems. Carries a safe message and an HTTP status."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _clean_number(value):
    """Return a finite float, or None if the value is missing or invalid."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    value = float(value)
    return value if math.isfinite(value) else None


def fetch_current_weather(latitude, longitude) -> dict:
    lat = _clean_number(latitude)
    lon = _clean_number(longitude)

    if lat is None or lon is None:
        raise WeatherServiceError("Plant has no valid coordinates.", 422)
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise WeatherServiceError("Plant coordinates are out of range.", 422)

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,shortwave_radiation",
        "timezone": "auto",
    }

    try:
        response = requests.get(
            OPEN_METEO_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS
        )
    except requests.exceptions.Timeout:
        logger.warning("Open-Meteo request timed out")
        raise WeatherServiceError("Weather service timed out.", 504) from None
    except requests.exceptions.RequestException:
        logger.exception("Open-Meteo request failed")
        raise WeatherServiceError("Could not reach the weather service.", 502) from None

    if response.status_code != 200:
        logger.warning("Open-Meteo returned status %s", response.status_code)
        raise WeatherServiceError("Weather service returned an error.", 502)

    try:
        body = response.json()
        current = body["current"]
        units = body.get("current_units", {})
    except (ValueError, KeyError, TypeError):
        logger.exception("Invalid Open-Meteo response")
        raise WeatherServiceError("Weather service returned invalid data.", 502) from None

    temperature = _clean_number(current.get("temperature_2m"))
    humidity = _clean_number(current.get("relative_humidity_2m"))
    radiation = _clean_number(current.get("shortwave_radiation"))

    if temperature is None and humidity is None and radiation is None:
        raise WeatherServiceError("Weather service returned no usable values.", 502)

    return {
        "source": "open-meteo",
        "observed_at_local": current.get("time"),
        "timezone": body.get("timezone"),
        "ambient_temperature_c": temperature,
        "relative_humidity_percent": humidity,
        "shortwave_radiation_w_m2": radiation,
        # Plain unit conversion (W/m2 -> kW/m2) to match the model's
        # IRRADIATION scale. Still an estimate, not a panel sensor reading.
        "irradiation_kw_m2": round(radiation / 1000, 4) if radiation is not None else None,
        "units": {
            "temperature": units.get("temperature_2m", "°C"),
            "humidity": units.get("relative_humidity_2m", "%"),
            "radiation": units.get("shortwave_radiation", "W/m²"),
        },
    }