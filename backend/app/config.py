from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote_plus
from urllib.parse import urlparse

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
    public_base_url: str
    auth_session_days: int
    song_favorites_file: Path
    custom_songs_file: Path
    mystery_song_assignments_file: Path
    song_locations_file: Path
    song_location_user_nodes_file: Path
    song_location_assignments_file: Path
    song_location_delete_password: str
    song_share_ttl_hours: int
    rate_limit_window_seconds: int
    rate_limit_global_requests: int
    rate_limit_auth_requests: int
    rate_limit_share_requests: int
    rate_limit_write_requests: int
    spotify_client_id: str
    spotify_client_secret: str



def _parse_origins(value: str) -> list[str]:
    raw_origins = [item.strip() for item in value.split(',') if item.strip()]
    parsed_origins: list[str] = []
    seen_origins: set[str] = set()

    for origin in raw_origins:
        if origin == '*':
            continue
        normalized = _normalize_public_base_url(origin)
        if not normalized:
            continue
        lookup_key = normalized.casefold()
        if lookup_key in seen_origins:
            continue
        seen_origins.add(lookup_key)
        parsed_origins.append(normalized)

    return parsed_origins


def _normalize_public_base_url(value: str | None) -> str:
    candidate = str(value or '').strip().rstrip('/')
    if not candidate:
        return ''

    parsed = urlparse(candidate)
    if parsed.scheme not in {'http', 'https'}:
        return ''
    if not parsed.netloc:
        return ''
    return f'{parsed.scheme}://{parsed.netloc}'


def _parse_positive_int(value: str, default: int) -> int:
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


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


def _resolve_song_locations_file() -> Path:
    custom_path = os.getenv('SONG_LOCATIONS_FILE', '').strip()
    if custom_path:
        resolved = Path(custom_path).expanduser()
        if not resolved.is_absolute():
            resolved = PROJECT_DIR / resolved
        return resolved
    return PROJECT_DIR / 'data' / 'song_locations.json'


def _resolve_song_location_assignments_file() -> Path:
    custom_path = os.getenv('SONG_LOCATION_ASSIGNMENTS_FILE', '').strip()
    if custom_path:
        resolved = Path(custom_path).expanduser()
        if not resolved.is_absolute():
            resolved = PROJECT_DIR / resolved
        return resolved
    return PROJECT_DIR / 'data' / 'song_location_assignments.json'


def _resolve_song_location_user_nodes_file() -> Path:
    custom_path = os.getenv('SONG_LOCATION_USER_NODES_FILE', '').strip()
    if custom_path:
        resolved = Path(custom_path).expanduser()
        if not resolved.is_absolute():
            resolved = PROJECT_DIR / resolved
        return resolved
    return PROJECT_DIR / 'data' / 'song_location_user_nodes.json'


def get_settings() -> Settings:
    return Settings(
        database_url=_build_database_url(),
        cors_allow_origins=_parse_origins(os.getenv('CORS_ALLOW_ORIGINS', '')),
        public_base_url=_normalize_public_base_url(os.getenv('PUBLIC_BASE_URL', '')),
        auth_session_days=_parse_positive_int(os.getenv('AUTH_SESSION_DAYS', '30'), 30),
        song_favorites_file=_resolve_song_favorites_file(),
        custom_songs_file=_resolve_custom_songs_file(),
        mystery_song_assignments_file=_resolve_mystery_song_assignments_file(),
        song_locations_file=_resolve_song_locations_file(),
        song_location_user_nodes_file=_resolve_song_location_user_nodes_file(),
        song_location_assignments_file=_resolve_song_location_assignments_file(),
        song_location_delete_password=os.getenv('SONG_LOCATION_DELETE_PASSWORD', '').strip(),
        song_share_ttl_hours=_parse_positive_int(os.getenv('SONG_SHARE_TTL_HOURS', '168'), 168),
        rate_limit_window_seconds=_parse_positive_int(os.getenv('RATE_LIMIT_WINDOW_SECONDS', '60'), 60),
        rate_limit_global_requests=_parse_positive_int(os.getenv('RATE_LIMIT_GLOBAL_REQUESTS', '240'), 240),
        rate_limit_auth_requests=_parse_positive_int(os.getenv('RATE_LIMIT_AUTH_REQUESTS', '30'), 30),
        rate_limit_share_requests=_parse_positive_int(os.getenv('RATE_LIMIT_SHARE_REQUESTS', '45'), 45),
        rate_limit_write_requests=_parse_positive_int(os.getenv('RATE_LIMIT_WRITE_REQUESTS', '80'), 80),
        spotify_client_id=os.getenv('SPOTIFY_CLIENT_ID', '').strip(),
        spotify_client_secret=os.getenv('SPOTIFY_CLIENT_SECRET', '').strip(),
    )


settings = get_settings()
