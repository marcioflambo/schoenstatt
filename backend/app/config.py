from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
PROJECT_DIR = BACKEND_DIR.parent

# Load optional environment files for local development.
load_dotenv(PROJECT_DIR / '.env', override=False)
load_dotenv(BACKEND_DIR / '.env', override=False)


def _build_database_url() -> str | None:
    direct_url = os.getenv('DATABASE_URL')
    if direct_url:
        return direct_url

    host = os.getenv('POSTGRES_HOST')
    user = os.getenv('POSTGRES_USER')
    password = os.getenv('POSTGRES_PASSWORD')
    database = os.getenv('POSTGRES_DB')
    port = os.getenv('POSTGRES_PORT', '5432')

    if not all([host, user, password, database]):
        return None

    return f"postgresql://{user}:{quote_plus(password)}@{host}:{port}/{database}?sslmode=require"


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    cors_allow_origins: list[str]



def _parse_origins(value: str) -> list[str]:
    origins = [item.strip() for item in value.split(',') if item.strip()]
    return origins or ['*']


def get_settings() -> Settings:
    return Settings(
        database_url=_build_database_url(),
        cors_allow_origins=_parse_origins(os.getenv('CORS_ALLOW_ORIGINS', '*')),
    )


settings = get_settings()
