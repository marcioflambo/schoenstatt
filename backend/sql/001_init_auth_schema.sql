BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_json_store (
    store_key TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_email_normalized
    ON app_users ((lower(btrim(email))));

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

CREATE INDEX IF NOT EXISTS idx_app_user_sessions_user_id
    ON app_user_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_app_user_sessions_expires_at
    ON app_user_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_app_user_sessions_revoked_at
    ON app_user_sessions (revoked_at);

CREATE OR REPLACE FUNCTION set_row_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_users_updated_at ON app_users;
CREATE TRIGGER trg_app_users_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

DROP TRIGGER IF EXISTS trg_app_user_sessions_updated_at ON app_user_sessions;
CREATE TRIGGER trg_app_user_sessions_updated_at
BEFORE UPDATE ON app_user_sessions
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

COMMIT;
