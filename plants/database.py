"""
MySQL database connection infrastructure for TEJAS plant management.

This file only sets up the CONNECTION. It does not create tables and has
no API endpoints.

It provides:
    Base                        - parent class for future table models
    get_engine()                - the connection "manager" (created once)
    get_session_factory()       - makes database sessions (created once)
    get_db()                    - gives one session and ALWAYS closes it
    check_database_connection() - simple connectivity test

Settings come from environment variables (or a local .env file):
    DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
See .env.example. Never write the real password in code.

Quick test (run from the project root, with your virtual environment on):
    python -m plants.database
"""

import os
from collections.abc import Generator
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


# --------------------------------------------------
# 1. Load the .env file (if there is one)
# --------------------------------------------------
# The path is built from this file's location, so it works no matter which
# folder you start the app from. Variables that are already set in the
# system (for example on a cloud host) are NOT overwritten by .env.

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")


# --------------------------------------------------
# 2. Base class for future table models
# --------------------------------------------------

class Base(DeclarativeBase):
    """All future database table classes will inherit from this."""


# --------------------------------------------------
# 3. Read settings from environment variables
# --------------------------------------------------

def _get_required_setting(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        # Only the NAME of the setting is mentioned, never any value.
        raise RuntimeError(
            f"Missing database setting: {name}. "
            "Set it in your .env file (see .env.example)."
        )
    return value


def _build_database_url() -> URL:
    host = os.getenv("DB_HOST", "localhost").strip() or "localhost"

    port_text = os.getenv("DB_PORT", "3306").strip() or "3306"
    try:
        port = int(port_text)
    except ValueError:
        raise RuntimeError("DB_PORT must be a whole number, e.g. 3306.") from None

    # URL.create() escapes special characters (@ : / # % and so on) in the
    # username and password for us, so a password like "p@ss/w#rd" is safe.
    # Building the text URL by hand would break on such characters.
    return URL.create(
        drivername="mysql+pymysql",
        username=_get_required_setting("DB_USER"),
        password=_get_required_setting("DB_PASSWORD"),
        host=host,
        port=port,
        database=_get_required_setting("DB_NAME"),
        query={"charset": "utf8mb4"},
    )


# --------------------------------------------------
# 4. Engine and session factory (created once, on first use)
# --------------------------------------------------
# They are created lazily (not at import time), so a missing or wrong
# database setting cannot break the rest of the application, such as the
# existing /predict endpoint, just because this file was imported.

@lru_cache
def get_engine() -> Engine:
    return create_engine(
        _build_database_url(),
        echo=False,               # never print SQL to the console
        hide_parameters=True,     # keep SQL values out of error messages
        pool_pre_ping=True,       # test a connection before using it
        pool_recycle=280,         # replace old connections (MySQL closes idle ones)
        connect_args={"connect_timeout": 10},  # do not wait forever
    )


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(
        bind=get_engine(),
        autoflush=False,
        expire_on_commit=False,   # objects stay readable after commit
    )


# --------------------------------------------------
# 5. Session helper (always closes the session)
# --------------------------------------------------

def get_db() -> Generator[Session, None, None]:
    """
    Gives one database session and ALWAYS closes it afterwards, even if an
    error happens. Later, FastAPI endpoints will receive a session with
    Depends(get_db).
    """
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


# --------------------------------------------------
# 6. Connectivity test
# --------------------------------------------------

# Common MySQL error codes, explained in simple words.
_MYSQL_HINTS = {
    1045: "Access denied: check DB_USER and DB_PASSWORD.",
    1049: "Unknown database: check DB_NAME (does the database exist?).",
    1044: "This user has no permission on this database.",
    2003: "Cannot reach MySQL: check DB_HOST and DB_PORT, and that MySQL is running.",
    2005: "Unknown host: check DB_HOST.",
}


def check_database_connection() -> dict:
    """
    Opens a connection and runs "SELECT 1".
    Returns {"connected": True/False, "message": "..."}.
    Never raises, and the message never contains the password or the URL.
    """
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"connected": True, "message": "Database connection successful."}

    except RuntimeError as error:
        # Our own settings error (only names the missing setting).
        return {"connected": False, "message": str(error)}

    except SQLAlchemyError as error:
        # Do NOT return str(error): keep the message safe and short.
        code = None
        original = getattr(error, "orig", None)
        if original is not None and original.args and isinstance(original.args[0], int):
            code = original.args[0]
        hint = _MYSQL_HINTS.get(code, "Check your database settings and that MySQL is running.")
        suffix = f" (MySQL error code {code})" if code is not None else ""
        return {
            "connected": False,
            "message": f"Database connection failed: {hint}{suffix}",
        }

    except ModuleNotFoundError as error:
        # For example, the PyMySQL "cryptography" requirement.
        return {
            "connected": False,
            "message": f"A required Python package is missing: {error.name}.",
        }


if __name__ == "__main__":
    result = check_database_connection()
    print(result["message"])