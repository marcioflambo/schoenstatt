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
    song_favorites_file: Path
    custom_songs_file: Path
    mystery_song_assignments_file: Path



def _parse_origins(value: str) -> list[str]:
    origins = [item.strip() for item in value.split(',') if item.strip()]
    return origins or ['*']


def _resolve_song_favorites_file() -> Path:
    custom_path = os.getenv('SONG_FAVORITES_FILE', '').strip()
    if custom_path:
        resolved = Path(custom_path).expanduser()
        if not resolved.is_absolute():
            resolved = PROJECT_DIR / resolved
        return resolved

    # Default favorites storage should be persistent and not under tmp/.
    default_path = PROJECT_DIR / 'data' / 'song_favorites.json'
    legacy_tmp_path = PROJECT_DIR / 'tmp' / 'song_favorites.json'

    # One-time best-effort migration from legacy tmp location.
    if not default_path.exists() and legacy_tmp_path.exists():
        try:
            default_path.parent.mkdir(parents=True, exist_ok=True)
            default_path.write_text(legacy_tmp_path.read_text(encoding='utf-8'), encoding='utf-8')
        except OSError:
            pass

    return default_path


def _resolve_custom_songs_file() -> Path:
    custom_path = os.getenv('CUSTOM_SONGS_FILE', '').strip()
    if custom_path:
        resolved = Path(custom_path).expanduser()
        if not resolved.is_absolute():
            resolved = PROJECT_DIR / resolved
        return resolved
    return PROJECT_DIR / 'data' / 'custom_songs.json'


def _resolve_mystery_song_assignments_file() -> Path:
    custom_path = os.getenv('MYSTERY_SONG_ASSIGNMENTS_FILE', '').strip()
    if custom_path:
        resolved = Path(custom_path).expanduser()
        if not resolved.is_absolute():
            resolved = PROJECT_DIR / resolved
        return resolved
    return PROJECT_DIR / 'data' / 'mystery_song_assignments.json'


def get_settings() -> Settings:
    return Settings(
        database_url=_build_database_url(),
        cors_allow_origins=_parse_origins(os.getenv('CORS_ALLOW_ORIGINS', '*')),
        song_favorites_file=_resolve_song_favorites_file(),
        custom_songs_file=_resolve_custom_songs_file(),
        mystery_song_assignments_file=_resolve_mystery_song_assignments_file(),
    )


settings = get_settings()
