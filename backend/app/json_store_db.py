from __future__ import annotations

import json
import logging
from typing import Any, Callable

from psycopg import connect
from psycopg.errors import OperationalError

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS app_json_store (
    store_key TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

_LOGGER = logging.getLogger("uvicorn.error")


def _estimate_items(payload: dict[str, object]) -> int:
    for list_key in ("favorites", "songs", "assignments"):
        value = payload.get(list_key)
        if isinstance(value, list):
            return len(value)
    return 0


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
    payload_size_bytes = len(serialized_payload.encode("utf-8"))
    item_count = _estimate_items(payload)
    _LOGGER.info(
        "Enviando dados ao PostgreSQL (store_key=%s, items=%s, payload_bytes=%s)",
        store_key,
        item_count,
        payload_size_bytes,
    )
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
        _LOGGER.info(
            "Dados persistidos no PostgreSQL (store_key=%s, items=%s)",
            store_key,
            item_count,
        )
    except OperationalError as exc:
        raise RuntimeError(f"Falha ao conectar no PostgreSQL para store '{store_key}': {exc}") from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise RuntimeError(f"Erro ao salvar store '{store_key}' no PostgreSQL: {exc}") from exc


def mutate_store(
    database_url: str,
    store_key: str,
    mutator: Callable[[dict[str, object] | None], dict[str, object]],
) -> dict[str, object]:
    try:
        with connect(database_url, connect_timeout=6) as conn:
            with conn.cursor() as cur:
                cur.execute(_TABLE_SQL)
                cur.execute(
                    "SELECT payload FROM app_json_store WHERE store_key = %s FOR UPDATE;",
                    (store_key,),
                )
                row = cur.fetchone()
                current_payload_raw = _coerce_payload(row[0]) if row else None
                current_payload = current_payload_raw if isinstance(current_payload_raw, dict) else None

                next_payload = mutator(current_payload)
                if not isinstance(next_payload, dict):
                    raise RuntimeError(
                        f"Mutator da store '{store_key}' retornou payload invalido."
                    )

                if current_payload == next_payload:
                    conn.commit()
                    return next_payload

                serialized_payload = json.dumps(next_payload, ensure_ascii=False)
                payload_size_bytes = len(serialized_payload.encode("utf-8"))
                item_count = _estimate_items(next_payload)
                _LOGGER.info(
                    "Enviando dados ao PostgreSQL (store_key=%s, items=%s, payload_bytes=%s)",
                    store_key,
                    item_count,
                    payload_size_bytes,
                )
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

        _LOGGER.info(
            "Dados persistidos no PostgreSQL (store_key=%s, items=%s)",
            store_key,
            _estimate_items(next_payload),
        )
        return next_payload
    except OperationalError as exc:
        raise RuntimeError(f"Falha ao conectar no PostgreSQL para store '{store_key}': {exc}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Store '{store_key}' com JSON invalido no banco.") from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise RuntimeError(f"Erro ao atualizar store '{store_key}' no PostgreSQL: {exc}") from exc
