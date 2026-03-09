from __future__ import annotations

import logging
from threading import Lock

from psycopg import connect
from psycopg.errors import OperationalError

_LOGGER = logging.getLogger('uvicorn.error')
_SCHEMA_BOOTSTRAPPED_URLS: set[str] = set()
_SCHEMA_BOOTSTRAP_LOCK = Lock()

_SCHEMA_STATEMENTS = (
    "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
    """
    CREATE TABLE IF NOT EXISTS app_json_store (
        store_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS app_users (
        id BIGSERIAL PRIMARY KEY,
        user_guid UUID NOT NULL DEFAULT gen_random_uuid(),
        full_name VARCHAR(150) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_app_users_user_guid UNIQUE (user_guid),
        CONSTRAINT ck_app_users_full_name_not_blank CHECK (btrim(full_name) <> ''),
        CONSTRAINT ck_app_users_email_not_blank CHECK (btrim(email) <> '')
    );
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_email_normalized
        ON app_users ((lower(btrim(email))));
    """,
    """
    CREATE TABLE IF NOT EXISTS app_user_sessions (
        id BIGSERIAL PRIMARY KEY,
        session_guid UUID NOT NULL DEFAULT gen_random_uuid(),
        user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        refresh_token_hash VARCHAR(255) NOT NULL,
        user_agent TEXT NOT NULL DEFAULT '',
        ip_address INET NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_app_user_sessions_session_guid UNIQUE (session_guid),
        CONSTRAINT ck_app_user_sessions_refresh_token_not_blank CHECK (btrim(refresh_token_hash) <> '')
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_app_user_sessions_user_id
        ON app_user_sessions (user_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_app_user_sessions_expires_at
        ON app_user_sessions (expires_at);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_app_user_sessions_revoked_at
        ON app_user_sessions (revoked_at);
    """,
    """
    CREATE TABLE IF NOT EXISTS app_auth_qr_sessions (
        id BIGSERIAL PRIMARY KEY,
        session_guid UUID NOT NULL DEFAULT gen_random_uuid(),
        approve_token_hash VARCHAR(255) NOT NULL,
        poll_token_hash VARCHAR(255) NOT NULL,
        requester_user_agent TEXT NOT NULL DEFAULT '',
        requester_ip_address INET NULL,
        approver_user_agent TEXT NOT NULL DEFAULT '',
        approver_ip_address INET NULL,
        approved_user_id BIGINT NULL REFERENCES app_users(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMPTZ NOT NULL,
        approved_at TIMESTAMPTZ NULL,
        consumed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_app_auth_qr_sessions_session_guid UNIQUE (session_guid),
        CONSTRAINT ck_app_auth_qr_sessions_approve_token_not_blank CHECK (btrim(approve_token_hash) <> ''),
        CONSTRAINT ck_app_auth_qr_sessions_poll_token_not_blank CHECK (btrim(poll_token_hash) <> ''),
        CONSTRAINT ck_app_auth_qr_sessions_status_valid CHECK (
            status IN ('pending', 'approved', 'consumed', 'expired')
        )
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_app_auth_qr_sessions_expires_at
        ON app_auth_qr_sessions (expires_at);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_app_auth_qr_sessions_status
        ON app_auth_qr_sessions (status);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_app_auth_qr_sessions_approved_user_id
        ON app_auth_qr_sessions (approved_user_id);
    """,
    """
    CREATE OR REPLACE FUNCTION set_row_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    """,
    "DROP TRIGGER IF EXISTS trg_app_users_updated_at ON app_users;",
    """
    CREATE TRIGGER trg_app_users_updated_at
    BEFORE UPDATE ON app_users
    FOR EACH ROW
    EXECUTE FUNCTION set_row_updated_at();
    """,
    "DROP TRIGGER IF EXISTS trg_app_user_sessions_updated_at ON app_user_sessions;",
    """
    CREATE TRIGGER trg_app_user_sessions_updated_at
    BEFORE UPDATE ON app_user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION set_row_updated_at();
    """,
    "DROP TRIGGER IF EXISTS trg_app_auth_qr_sessions_updated_at ON app_auth_qr_sessions;",
    """
    CREATE TRIGGER trg_app_auth_qr_sessions_updated_at
    BEFORE UPDATE ON app_auth_qr_sessions
    FOR EACH ROW
    EXECUTE FUNCTION set_row_updated_at();
    """,
)


def _normalize_database_url(database_url: str | None) -> str:
    return str(database_url or '').strip()


def ensure_app_schema(database_url: str | None) -> None:
    safe_database_url = _normalize_database_url(database_url)
    if not safe_database_url:
        return

    try:
        with connect(safe_database_url, connect_timeout=6) as conn:
            with conn.cursor() as cur:
                for statement in _SCHEMA_STATEMENTS:
                    cur.execute(statement)
            conn.commit()
    except OperationalError as exc:
        raise RuntimeError(f'Falha ao conectar no PostgreSQL para aplicar schema inicial: {exc}') from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise RuntimeError(f'Erro ao aplicar schema inicial no PostgreSQL: {exc}') from exc


def ensure_app_schema_once(database_url: str | None) -> None:
    safe_database_url = _normalize_database_url(database_url)
    if not safe_database_url:
        return

    with _SCHEMA_BOOTSTRAP_LOCK:
        if safe_database_url in _SCHEMA_BOOTSTRAPPED_URLS:
            return
        ensure_app_schema(safe_database_url)
        _SCHEMA_BOOTSTRAPPED_URLS.add(safe_database_url)
        _LOGGER.info('Schema inicial do PostgreSQL garantido para autenticacao e stores JSON.')
