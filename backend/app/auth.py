from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone
from ipaddress import ip_address

from psycopg import connect
from psycopg.errors import OperationalError, UniqueViolation
from psycopg.rows import dict_row
from pydantic import BaseModel

_PASSWORD_HASH_ALGO = 'pbkdf2_sha256'
_PASSWORD_HASH_ITERATIONS = 480_000
_PASSWORD_SALT_BYTES = 16
_MIN_PASSWORD_LENGTH = 6
_MAX_PASSWORD_LENGTH = 128
_MAX_USER_AGENT_LENGTH = 500
_DEFAULT_SESSION_DAYS = 30
_EMAIL_REGEX = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


class AuthRegisterRequest(BaseModel):
    name: str = ''
    email: str = ''
    password: str = ''


class AuthLoginRequest(BaseModel):
    email: str = ''
    password: str = ''


class AuthAccountUpdateRequest(BaseModel):
    name: str = ''
    email: str = ''
    password: str = ''


def _normalize_spaces(value: str | None) -> str:
    return ' '.join((value or '').split()).strip()


def _require_database_url(database_url: str | None) -> str:
    safe_database_url = str(database_url or '').strip()
    if safe_database_url:
        return safe_database_url
    raise RuntimeError('DATABASE_URL nao configurada para autenticacao.')


def _normalize_email(email: str | None) -> str:
    safe_email = _normalize_spaces(email).lower()
    if not safe_email:
        raise ValueError('Informe o email.')
    if len(safe_email) > 255:
        raise ValueError('Email deve ter no maximo 255 caracteres.')
    if not _EMAIL_REGEX.fullmatch(safe_email):
        raise ValueError('Informe um email valido.')
    return safe_email


def _normalize_password(password: str | None) -> str:
    safe_password = str(password or '')
    if len(safe_password) < _MIN_PASSWORD_LENGTH:
        raise ValueError(f'Senha deve ter ao menos {_MIN_PASSWORD_LENGTH} caracteres.')
    if len(safe_password) > _MAX_PASSWORD_LENGTH:
        raise ValueError(f'Senha deve ter no maximo {_MAX_PASSWORD_LENGTH} caracteres.')
    return safe_password


def _normalize_full_name(name: str | None) -> str:
    safe_name = _normalize_spaces(name)
    if not safe_name:
        raise ValueError('Informe o nome.')
    if len(safe_name) > 150:
        raise ValueError('Nome deve ter no maximo 150 caracteres.')
    return safe_name


def _encode_b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode('ascii').rstrip('=')


def _decode_b64(value: str) -> bytes:
    padded_value = f'{value}{"=" * ((4 - (len(value) % 4)) % 4)}'
    return base64.urlsafe_b64decode(padded_value.encode('ascii'))


def _hash_password(password: str) -> str:
    safe_password = _normalize_password(password)
    salt = secrets.token_bytes(_PASSWORD_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        'sha256',
        safe_password.encode('utf-8'),
        salt,
        _PASSWORD_HASH_ITERATIONS,
    )
    return (
        f'{_PASSWORD_HASH_ALGO}'
        f'${_PASSWORD_HASH_ITERATIONS}'
        f'${_encode_b64(salt)}'
        f'${_encode_b64(digest)}'
    )


def _verify_password(password: str, stored_hash: str) -> bool:
    safe_password = str(password or '')
    safe_stored_hash = str(stored_hash or '')
    try:
        algo, raw_iterations, raw_salt, raw_digest = safe_stored_hash.split('$', 3)
        if algo != _PASSWORD_HASH_ALGO:
            return False
        iterations = int(raw_iterations)
        if iterations <= 0:
            return False
        salt = _decode_b64(raw_salt)
        expected_digest = _decode_b64(raw_digest)
        computed_digest = hashlib.pbkdf2_hmac(
            'sha256',
            safe_password.encode('utf-8'),
            salt,
            iterations,
        )
    except (ValueError, TypeError, OverflowError):
        return False

    return hmac.compare_digest(computed_digest, expected_digest)


def _hash_session_token(token: str) -> str:
    return hashlib.sha256(str(token).encode('utf-8')).hexdigest()


def _normalize_auth_token(token: str | None) -> str:
    safe_token = _normalize_spaces(token)
    if safe_token:
        return safe_token
    raise PermissionError('Token de autenticacao ausente.')


def _normalize_user_agent(value: str | None) -> str:
    safe_value = _normalize_spaces(value)
    if len(safe_value) <= _MAX_USER_AGENT_LENGTH:
        return safe_value
    return safe_value[:_MAX_USER_AGENT_LENGTH]


def _parse_ip(candidate: str | None) -> str | None:
    safe_candidate = _normalize_spaces(candidate)
    if not safe_candidate:
        return None
    try:
        return str(ip_address(safe_candidate))
    except ValueError:
        return None


def _resolve_client_ip(forwarded_for: str | None, client_ip: str | None) -> str | None:
    safe_forwarded_for = str(forwarded_for or '')
    if safe_forwarded_for:
        forwarded_candidates = [item.strip() for item in safe_forwarded_for.split(',') if item.strip()]
        for candidate in forwarded_candidates:
            parsed = _parse_ip(candidate)
            if parsed:
                return parsed
    return _parse_ip(client_ip)


def _coerce_session_days(raw_days: int | None) -> int:
    try:
        parsed_days = int(raw_days or 0)
    except (TypeError, ValueError):
        parsed_days = _DEFAULT_SESSION_DAYS
    return max(1, min(parsed_days, 365))


def _to_utc_iso(value: datetime | None) -> str:
    safe_value = value if isinstance(value, datetime) else datetime.now(timezone.utc)
    if safe_value.tzinfo is None:
        safe_value = safe_value.replace(tzinfo=timezone.utc)
    return safe_value.astimezone(timezone.utc).isoformat()


def _build_user_payload(row: dict[str, object]) -> dict[str, str]:
    return {
        'guid': str(row.get('user_guid') or ''),
        'name': str(row.get('full_name') or ''),
        'email': str(row.get('email') or ''),
    }


def _create_session(
    cur,
    user_id: int,
    session_days: int,
    user_agent: str | None,
    forwarded_for: str | None,
    client_ip: str | None,
) -> dict[str, str]:
    safe_user_id = int(user_id)
    if safe_user_id <= 0:
        raise RuntimeError('Usuario invalido para criar sessao.')

    token = secrets.token_urlsafe(48)
    token_hash = _hash_session_token(token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=_coerce_session_days(session_days))
    safe_ip_address = _resolve_client_ip(forwarded_for, client_ip)

    cur.execute(
        """
        INSERT INTO app_user_sessions (
            user_id,
            refresh_token_hash,
            user_agent,
            ip_address,
            expires_at
        )
        VALUES (%s, %s, %s, %s, %s)
        RETURNING session_guid, expires_at;
        """,
        (
            safe_user_id,
            token_hash,
            _normalize_user_agent(user_agent),
            safe_ip_address,
            expires_at,
        ),
    )
    row = cur.fetchone() or {}
    return {
        'token': token,
        'session_guid': str(row.get('session_guid') or ''),
        'expires_at_utc': _to_utc_iso(row.get('expires_at') if isinstance(row, dict) else None),
    }


def register_user(
    database_url: str | None,
    payload: AuthRegisterRequest,
    session_days: int = _DEFAULT_SESSION_DAYS,
    user_agent: str | None = None,
    forwarded_for: str | None = None,
    client_ip: str | None = None,
) -> dict[str, object]:
    safe_database_url = _require_database_url(database_url)
    safe_name = _normalize_full_name(payload.name)
    safe_email = _normalize_email(payload.email)
    safe_password = _normalize_password(payload.password)

    try:
        with connect(safe_database_url, connect_timeout=6) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT id
                    FROM app_users
                    WHERE lower(btrim(email)) = %s
                    LIMIT 1;
                    """,
                    (safe_email,),
                )
                existing = cur.fetchone()
                if existing:
                    raise ValueError('Ja existe um usuario com este email.')

                cur.execute(
                    """
                    INSERT INTO app_users (
                        full_name,
                        email,
                        password_hash
                    )
                    VALUES (%s, %s, %s)
                    RETURNING id, user_guid, full_name, email;
                    """,
                    (
                        safe_name,
                        safe_email,
                        _hash_password(safe_password),
                    ),
                )
                user_row = cur.fetchone()
                if not isinstance(user_row, dict):
                    raise RuntimeError('Falha ao criar usuario.')

                session_payload = _create_session(
                    cur,
                    int(user_row.get('id') or 0),
                    session_days,
                    user_agent=user_agent,
                    forwarded_for=forwarded_for,
                    client_ip=client_ip,
                )
            conn.commit()
    except ValueError:
        raise
    except UniqueViolation as exc:
        raise ValueError('Ja existe um usuario com este email.') from exc
    except OperationalError as exc:
        raise RuntimeError(f'Falha ao conectar no PostgreSQL para registrar usuario: {exc}') from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise RuntimeError(f'Erro ao registrar usuario: {exc}') from exc

    return {
        'user': _build_user_payload(user_row),
        **session_payload,
    }


def login_user(
    database_url: str | None,
    payload: AuthLoginRequest,
    session_days: int = _DEFAULT_SESSION_DAYS,
    user_agent: str | None = None,
    forwarded_for: str | None = None,
    client_ip: str | None = None,
) -> dict[str, object]:
    safe_database_url = _require_database_url(database_url)
    safe_email = _normalize_email(payload.email)
    safe_password = _normalize_password(payload.password)

    try:
        with connect(safe_database_url, connect_timeout=6) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT id, user_guid, full_name, email, password_hash, is_active
                    FROM app_users
                    WHERE lower(btrim(email)) = %s
                    LIMIT 1;
                    """,
                    (safe_email,),
                )
                user_row = cur.fetchone()
                if not isinstance(user_row, dict):
                    raise PermissionError('Email ou senha invalido.')

                if not bool(user_row.get('is_active')):
                    raise PermissionError('Conta inativa.')

                stored_password_hash = str(user_row.get('password_hash') or '')
                if not stored_password_hash or not _verify_password(safe_password, stored_password_hash):
                    raise PermissionError('Email ou senha invalido.')

                cur.execute(
                    """
                    UPDATE app_users
                    SET last_login_at = NOW()
                    WHERE id = %s;
                    """,
                    (int(user_row.get('id') or 0),),
                )

                session_payload = _create_session(
                    cur,
                    int(user_row.get('id') or 0),
                    session_days,
                    user_agent=user_agent,
                    forwarded_for=forwarded_for,
                    client_ip=client_ip,
                )
            conn.commit()
    except (ValueError, PermissionError):
        raise
    except OperationalError as exc:
        raise RuntimeError(f'Falha ao conectar no PostgreSQL para login: {exc}') from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise RuntimeError(f'Erro ao autenticar usuario: {exc}') from exc

    return {
        'user': _build_user_payload(user_row),
        **session_payload,
    }


def get_authenticated_user(database_url: str | None, token: str | None) -> dict[str, str]:
    safe_database_url = _require_database_url(database_url)
    safe_token = _normalize_auth_token(token)

    token_hash = _hash_session_token(safe_token)

    try:
        with connect(safe_database_url, connect_timeout=6) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT u.user_guid, u.full_name, u.email
                    FROM app_user_sessions AS s
                    INNER JOIN app_users AS u
                        ON u.id = s.user_id
                    WHERE s.refresh_token_hash = %s
                        AND s.revoked_at IS NULL
                        AND s.expires_at > NOW()
                        AND u.is_active = TRUE
                    ORDER BY s.id DESC
                    LIMIT 1;
                    """,
                    (token_hash,),
                )
                user_row = cur.fetchone()
                if not isinstance(user_row, dict):
                    raise PermissionError('Sessao invalida ou expirada.')
    except PermissionError:
        raise
    except OperationalError as exc:
        raise RuntimeError(f'Falha ao conectar no PostgreSQL para validar sessao: {exc}') from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise RuntimeError(f'Erro ao validar sessao: {exc}') from exc

    return _build_user_payload(user_row)


def update_authenticated_user(
    database_url: str | None,
    token: str | None,
    payload: AuthAccountUpdateRequest,
) -> dict[str, str]:
    safe_database_url = _require_database_url(database_url)
    safe_token = _normalize_auth_token(token)
    safe_name = _normalize_full_name(payload.name)
    safe_email = _normalize_email(payload.email)
    safe_password = _normalize_password(payload.password)
    next_password_hash = _hash_password(safe_password)

    token_hash = _hash_session_token(safe_token)

    try:
        with connect(safe_database_url, connect_timeout=6) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT u.id, u.user_guid, u.full_name, u.email
                    FROM app_user_sessions AS s
                    INNER JOIN app_users AS u
                        ON u.id = s.user_id
                    WHERE s.refresh_token_hash = %s
                        AND s.revoked_at IS NULL
                        AND s.expires_at > NOW()
                        AND u.is_active = TRUE
                    ORDER BY s.id DESC
                    LIMIT 1;
                    """,
                    (token_hash,),
                )
                current_user_row = cur.fetchone()
                if not isinstance(current_user_row, dict):
                    raise PermissionError('Sessao invalida ou expirada.')

                current_user_id = int(current_user_row.get('id') or 0)
                if current_user_id <= 0:
                    raise PermissionError('Sessao invalida ou expirada.')

                cur.execute(
                    """
                    SELECT id
                    FROM app_users
                    WHERE lower(btrim(email)) = %s
                        AND id <> %s
                    LIMIT 1;
                    """,
                    (safe_email, current_user_id),
                )
                existing_with_same_email = cur.fetchone()
                if isinstance(existing_with_same_email, dict):
                    raise ValueError('Ja existe um usuario com este email.')

                cur.execute(
                    """
                    UPDATE app_users
                    SET full_name = %s,
                        email = %s,
                        password_hash = %s
                    WHERE id = %s
                    RETURNING user_guid, full_name, email;
                    """,
                    (safe_name, safe_email, next_password_hash, current_user_id),
                )
                updated_user_row = cur.fetchone()
                if not isinstance(updated_user_row, dict):
                    raise RuntimeError('Falha ao atualizar conta.')
            conn.commit()
    except (ValueError, PermissionError):
        raise
    except OperationalError as exc:
        raise RuntimeError(f'Falha ao conectar no PostgreSQL para atualizar conta: {exc}') from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise RuntimeError(f'Erro ao atualizar conta: {exc}') from exc

    return _build_user_payload(updated_user_row)


def delete_authenticated_user(database_url: str | None, token: str | None) -> bool:
    safe_database_url = _require_database_url(database_url)
    safe_token = _normalize_auth_token(token)
    token_hash = _hash_session_token(safe_token)

    try:
        with connect(safe_database_url, connect_timeout=6) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT u.id
                    FROM app_user_sessions AS s
                    INNER JOIN app_users AS u
                        ON u.id = s.user_id
                    WHERE s.refresh_token_hash = %s
                        AND s.revoked_at IS NULL
                        AND s.expires_at > NOW()
                        AND u.is_active = TRUE
                    ORDER BY s.id DESC
                    LIMIT 1;
                    """,
                    (token_hash,),
                )
                user_row = cur.fetchone()
                if not isinstance(user_row, dict):
                    raise PermissionError('Sessao invalida ou expirada.')
                user_id = int(user_row.get('id') or 0)
                if user_id <= 0:
                    raise PermissionError('Sessao invalida ou expirada.')

                cur.execute(
                    """
                    DELETE FROM app_users
                    WHERE id = %s
                    RETURNING id;
                    """,
                    (user_id,),
                )
                removed_row = cur.fetchone()
            conn.commit()
    except PermissionError:
        raise
    except OperationalError as exc:
        raise RuntimeError(f'Falha ao conectar no PostgreSQL para remover conta: {exc}') from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise RuntimeError(f'Erro ao remover conta: {exc}') from exc

    return isinstance(removed_row, dict) and int(removed_row.get('id') or 0) > 0


def logout_user(database_url: str | None, token: str | None) -> bool:
    safe_database_url = _require_database_url(database_url)
    safe_token = _normalize_auth_token(token)

    token_hash = _hash_session_token(safe_token)

    try:
        with connect(safe_database_url, connect_timeout=6) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    UPDATE app_user_sessions
                    SET revoked_at = NOW()
                    WHERE refresh_token_hash = %s
                        AND revoked_at IS NULL
                    RETURNING id;
                    """,
                    (token_hash,),
                )
                removed_row = cur.fetchone()
            conn.commit()
    except PermissionError:
        raise
    except OperationalError as exc:
        raise RuntimeError(f'Falha ao conectar no PostgreSQL para encerrar sessao: {exc}') from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise RuntimeError(f'Erro ao encerrar sessao: {exc}') from exc

    return isinstance(removed_row, dict) and int(removed_row.get('id') or 0) > 0
