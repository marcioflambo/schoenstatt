from __future__ import annotations

import json
from typing import Any

from psycopg import connect
from psycopg.errors import OperationalError

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS app_json_store (
    store_key TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


def _coerce_payload(raw_payload: Any) -> Any:
    if raw_payload is None:
        return None
    if isinstance(raw_payload, str):
        return json.loads(raw_payload)
    return raw_payload


def load_store(database_url: str, store_key: str) -> dict[str, object] | None:
    try:
        with connect(database_url, connect_timeout=6) as conn:
            with conn.cursor() as cur:
                cur.execute(_TABLE_SQL)
                cur.execute(
                    "SELECT payload FROM app_json_store WHERE store_key = %s;",
                    (store_key,),
                )
                row = cur.fetchone()
                if not row:
                    return None
                payload = _coerce_payload(row[0])
                if isinstance(payload, dict):
                    return payload
                return None
    except OperationalError as exc:
        raise RuntimeError(f"Falha ao conectar no PostgreSQL para store '{store_key}': {exc}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Store '{store_key}' com JSON invalido no banco.") from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise RuntimeError(f"Erro ao carregar store '{store_key}' no PostgreSQL: {exc}") from exc


def save_store(database_url: str, store_key: str, payload: dict[str, object]) -> None:
    serialized_payload = json.dumps(payload, ensure_ascii=False)
    try:
        with connect(database_url, connect_timeout=6) as conn:
            with conn.cursor() as cur:
                cur.execute(_TABLE_SQL)
                cur.execute(
                    """
                    INSERT INTO app_json_store (store_key, payload, updated_at)
                    VALUES (%s, %s::jsonb, NOW())
                    ON CONFLICT (store_key)
                    DO UPDATE SET
                        payload = EXCLUDED.payload,
                        updated_at = NOW();
                    """,
                    (store_key, serialized_payload),
                )
            conn.commit()
    except OperationalError as exc:
        raise RuntimeError(f"Falha ao conectar no PostgreSQL para store '{store_key}': {exc}") from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise RuntimeError(f"Erro ao salvar store '{store_key}' no PostgreSQL: {exc}") from exc
