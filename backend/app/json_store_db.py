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
_PRUNABLE_LIST_KEYS_BY_STORE = {
    'song_favorites': 'favorites',
    'custom_songs': 'songs',
    'mystery_song_assignments': 'assignments',
    'song_location_assignments': 'assignments',
    'song_location_user_nodes': 'nodes',
}


def _estimate_items(payload: dict[str, object]) -> int:
    for list_key in ("favorites", "songs", "assignments"):
        value = payload.get(list_key)
        if isinstance(value, list):
            return len(value)
    return 0


def _resolve_store_base_key(store_key: str) -> str:
    safe_store_key = str(store_key or '').strip()
    if not safe_store_key:
        return ''
    return safe_store_key.split(':', maxsplit=1)[0]


def _should_prune_store_payload(store_key: str, payload: dict[str, object]) -> bool:
    if not isinstance(payload, dict):
        return False
    list_key = _PRUNABLE_LIST_KEYS_BY_STORE.get(_resolve_store_base_key(store_key))
    if not list_key:
        return False
    rows = payload.get(list_key)
    return isinstance(rows, list) and not rows


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
    should_prune = _should_prune_store_payload(store_key, payload)
    serialized_payload = json.dumps(payload, ensure_ascii=False)
    payload_size_bytes = len(serialized_payload.encode("utf-8"))
    item_count = _estimate_items(payload)
    if should_prune:
        _LOGGER.info(
            "Removendo store vazia do PostgreSQL (store_key=%s)",
            store_key,
        )
    else:
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
                if should_prune:
                    cur.execute(
                        "DELETE FROM app_json_store WHERE store_key = %s;",
                        (store_key,),
                    )
                else:
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
        if should_prune:
            _LOGGER.info(
                "Store removida do PostgreSQL por estar vazia (store_key=%s)",
                store_key,
            )
        else:
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

                if _should_prune_store_payload(store_key, next_payload):
                    if row:
                        _LOGGER.info(
                            "Removendo store vazia do PostgreSQL (store_key=%s)",
                            store_key,
                        )
                        cur.execute(
                            "DELETE FROM app_json_store WHERE store_key = %s;",
                            (store_key,),
                        )
                    conn.commit()
                    return next_payload

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
