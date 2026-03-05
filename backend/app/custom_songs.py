from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from pydantic import BaseModel

from .json_store_db import load_store, save_store

class CustomSongUpsertRequest(BaseModel):
    title: str
    key: str = ''
    lyrics_text: str = ''
    chords_text: str = ''


class CustomSongReorderRequest(BaseModel):
    ordered_ids: list[int]


_STORE_LOCK = RLock()
_STORE_KEY = 'custom_songs'


def _normalize_spaces(value: str | None) -> str:
    return ' '.join((value or '').split()).strip()


def _resolve_store_key(store_namespace: str | None = None) -> str:
    safe_namespace = _normalize_spaces(store_namespace)
    if not safe_namespace:
        return _STORE_KEY
    return f'{_STORE_KEY}:{safe_namespace}'


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_bool(value: object, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {'1', 'true', 'yes', 'sim', 'ativo'}:
            return True
        if normalized in {'0', 'false', 'no', 'nao', 'não', 'inativo'}:
            return False
    return default


def _empty_store() -> dict[str, object]:
    return {
        'last_id': 0,
        'songs': [],
    }


def _normalize_song_row(raw_row: dict[str, object]) -> dict[str, object]:
    return {
        'id': _coerce_int(raw_row.get('id'), 0),
        'title': _normalize_spaces(str(raw_row.get('title') or '')),
        'key': _normalize_spaces(str(raw_row.get('key') or '')),
        'lyrics_text': str(raw_row.get('lyrics_text') or raw_row.get('lyricsText') or ''),
        'chords_text': str(raw_row.get('chords_text') or raw_row.get('chordsText') or ''),
        'order_index': max(
            _coerce_int(raw_row.get('order_index') or raw_row.get('orderIndex'), 0),
            0,
        ),
        'is_active': _coerce_bool(raw_row.get('is_active'), default=True),
        'created_at_utc': str(raw_row.get('created_at_utc') or raw_row.get('createdAtUtc') or ''),
        'updated_at_utc': str(raw_row.get('updated_at_utc') or raw_row.get('updatedAtUtc') or ''),
        'deleted_at_utc': str(raw_row.get('deleted_at_utc') or raw_row.get('deletedAtUtc') or ''),
    }


def _normalize_store(raw_store: object) -> dict[str, object]:
    if not isinstance(raw_store, dict):
        return _empty_store()

    raw_songs = raw_store.get('songs')
    song_rows: list[dict[str, object]] = []
    if isinstance(raw_songs, list):
        for item in raw_songs:
            if isinstance(item, dict):
                row = _normalize_song_row(item)
                if row['id'] > 0 and row['title']:
                    song_rows.append(row)

    max_id = 0
    for row in song_rows:
        max_id = max(max_id, _coerce_int(row.get('id'), 0))

    # Backfill missing order indexes keeping the current recency-based order.
    max_order = max((_coerce_int(row.get('order_index'), 0) for row in song_rows), default=0)
    next_order = max_order + 1
    for row in sorted(
        song_rows,
        key=lambda item: (
            str(item.get('updated_at_utc') or ''),
            _coerce_int(item.get('id'), 0),
        ),
        reverse=True,
    ):
        if _coerce_int(row.get('order_index'), 0) <= 0:
            row['order_index'] = next_order
            next_order += 1

    last_id = max(_coerce_int(raw_store.get('last_id'), 0), max_id)

    return {
        'last_id': last_id,
        'songs': song_rows,
    }


def _read_store(
    file_path: Path,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> dict[str, object]:
    if database_url:
        database_store = load_store(database_url, _resolve_store_key(store_namespace))
        if database_store is not None:
            return _normalize_store(database_store)
        return _empty_store()

    if not file_path.exists():
        return _empty_store()

    try:
        raw = json.loads(file_path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'Arquivo de músicas manuais inválido: {file_path}') from exc
    except OSError as exc:
        raise RuntimeError(f'Falha ao ler arquivo de músicas manuais: {exc}') from exc

    return _normalize_store(raw)


def _write_store(
    file_path: Path,
    store: dict[str, object],
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> None:
    normalized_store = _normalize_store(store)
    if database_url:
        save_store(database_url, _resolve_store_key(store_namespace), normalized_store)
        return

    file_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = file_path.with_suffix(f'{file_path.suffix}.tmp')

    payload = json.dumps(normalized_store, ensure_ascii=False, indent=2)
    try:
        temp_path.write_text(payload, encoding='utf-8')
        temp_path.replace(file_path)
    except OSError as exc:
        raise RuntimeError(f'Falha ao salvar arquivo de músicas manuais: {exc}') from exc
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


def _row_to_payload(row: dict[str, object]) -> dict[str, object]:
    return {
        'id': _coerce_int(row.get('id'), 0),
        'title': row.get('title') or '',
        'key': row.get('key') or '',
        'lyrics_text': row.get('lyrics_text') or '',
        'chords_text': row.get('chords_text') or '',
        'order_index': _coerce_int(row.get('order_index'), 0),
        'is_active': _coerce_bool(row.get('is_active'), default=True),
        'created_at_utc': row.get('created_at_utc') or None,
        'updated_at_utc': row.get('updated_at_utc') or None,
        'deleted_at_utc': row.get('deleted_at_utc') or None,
    }


def list_custom_songs(
    custom_songs_file: Path,
    include_inactive: bool = False,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> list[dict[str, object]]:
    with _STORE_LOCK:
        store = _read_store(
            custom_songs_file,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('songs')
        song_rows = rows if isinstance(rows, list) else []

    normalized_rows = [
        _normalize_song_row(item)
        for item in song_rows
        if isinstance(item, dict)
    ]
    if not include_inactive:
        normalized_rows = [row for row in normalized_rows if _coerce_bool(row.get('is_active'), default=True)]
    normalized_rows.sort(
        key=lambda row: (
            str(row.get('updated_at_utc') or ''),
            _coerce_int(row.get('id'), 0),
        ),
        reverse=True,
    )
    normalized_rows.sort(
        key=lambda row: (
            _coerce_int(row.get('order_index'), 0) <= 0,
            _coerce_int(row.get('order_index'), 0) if _coerce_int(row.get('order_index'), 0) > 0 else 10**9,
        )
    )
    return [_row_to_payload(row) for row in normalized_rows]


def create_custom_song(
    custom_songs_file: Path,
    payload: CustomSongUpsertRequest,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> dict[str, object]:
    title = _normalize_spaces(payload.title)
    if not title:
        raise ValueError('Informe o título da música.')

    now_iso = _now_utc_iso()
    with _STORE_LOCK:
        store = _read_store(
            custom_songs_file,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('songs')
        song_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []
        max_order = max(
            (_coerce_int(item.get('order_index'), 0) for item in song_rows if isinstance(item, dict)),
            default=0,
        )

        song_id = _coerce_int(store.get('last_id'), 0) + 1
        row = {
            'id': song_id,
            'title': title,
            'key': _normalize_spaces(payload.key),
            'lyrics_text': str(payload.lyrics_text or ''),
            'chords_text': str(payload.chords_text or ''),
            'order_index': max_order + 1,
            'is_active': True,
            'created_at_utc': now_iso,
            'updated_at_utc': now_iso,
            'deleted_at_utc': '',
        }
        song_rows.append(row)

        store['last_id'] = max(_coerce_int(store.get('last_id'), 0), song_id)
        store['songs'] = song_rows
        _write_store(
            custom_songs_file,
            store,
            database_url=database_url,
            store_namespace=store_namespace,
        )

    return _row_to_payload(row)


def update_custom_song(
    custom_songs_file: Path,
    song_id: int,
    payload: CustomSongUpsertRequest,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> dict[str, object]:
    if song_id <= 0:
        raise ValueError('Música manual não encontrada.')

    title = _normalize_spaces(payload.title)
    if not title:
        raise ValueError('Informe o título da música.')

    now_iso = _now_utc_iso()
    with _STORE_LOCK:
        store = _read_store(
            custom_songs_file,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('songs')
        song_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []

        target_index = next(
            (
                index
                for index, item in enumerate(song_rows)
                if isinstance(item, dict) and _coerce_int(item.get('id'), 0) == song_id
            ),
            -1,
        )
        if target_index < 0:
            raise ValueError('Música manual não encontrada.')

        existing = _normalize_song_row(song_rows[target_index])
        row = {
            'id': song_id,
            'title': title,
            'key': _normalize_spaces(payload.key),
            'lyrics_text': str(payload.lyrics_text or ''),
            'chords_text': str(payload.chords_text or ''),
            'order_index': max(_coerce_int(existing.get('order_index'), 0), 1),
            'is_active': _coerce_bool(existing.get('is_active'), default=True),
            'created_at_utc': existing.get('created_at_utc') or now_iso,
            'updated_at_utc': now_iso,
            'deleted_at_utc': str(existing.get('deleted_at_utc') or ''),
        }
        song_rows[target_index] = row
        store['songs'] = song_rows
        _write_store(
            custom_songs_file,
            store,
            database_url=database_url,
            store_namespace=store_namespace,
        )

    return _row_to_payload(row)


def delete_custom_song(
    custom_songs_file: Path,
    song_id: int,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> bool:
    if song_id <= 0:
        raise ValueError('Música manual não encontrada.')

    with _STORE_LOCK:
        store = _read_store(
            custom_songs_file,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('songs')
        song_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []
        target_index = next(
            (
                index
                for index, item in enumerate(song_rows)
                if isinstance(item, dict) and _coerce_int(item.get('id'), 0) == song_id
            ),
            -1,
        )
        if target_index < 0:
            return False

        del song_rows[target_index]
        store['songs'] = song_rows
        _write_store(
            custom_songs_file,
            store,
            database_url=database_url,
            store_namespace=store_namespace,
        )

    return True


def restore_custom_song(
    custom_songs_file: Path,
    song_id: int,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> dict[str, object]:
    if song_id <= 0:
        raise ValueError('Música manual não encontrada.')

    now_iso = _now_utc_iso()
    with _STORE_LOCK:
        store = _read_store(
            custom_songs_file,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('songs')
        song_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []

        target_index = next(
            (
                index
                for index, item in enumerate(song_rows)
                if isinstance(item, dict) and _coerce_int(item.get('id'), 0) == song_id
            ),
            -1,
        )
        if target_index < 0:
            raise ValueError('Música manual não encontrada.')

        existing = _normalize_song_row(song_rows[target_index])
        row = {
            **existing,
            'is_active': True,
            'updated_at_utc': now_iso,
            'deleted_at_utc': '',
        }
        song_rows[target_index] = row
        store['songs'] = song_rows
        _write_store(
            custom_songs_file,
            store,
            database_url=database_url,
            store_namespace=store_namespace,
        )

    return _row_to_payload(row)


def reorder_custom_songs(
    custom_songs_file: Path,
    ordered_ids: list[int],
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> list[dict[str, object]]:
    seen_ids: set[int] = set()
    normalized_order: list[int] = []
    for raw_id in ordered_ids:
        song_id = _coerce_int(raw_id, 0)
        if song_id <= 0:
            raise ValueError('Lista de ordenação inválida.')
        if song_id in seen_ids:
            raise ValueError('Lista de ordenação inválida.')
        seen_ids.add(song_id)
        normalized_order.append(song_id)

    with _STORE_LOCK:
        store = _read_store(
            custom_songs_file,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('songs')
        song_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []

        normalized_rows = [
            _normalize_song_row(item)
            for item in song_rows
            if isinstance(item, dict)
        ]
        active_rows = [
            row
            for row in normalized_rows
            if _coerce_bool(row.get('is_active'), default=True)
        ]
        if not active_rows:
            store['songs'] = normalized_rows
            _write_store(
                custom_songs_file,
                store,
                database_url=database_url,
                store_namespace=store_namespace,
            )
            return []

        active_by_id = {
            _coerce_int(row.get('id'), 0): row
            for row in active_rows
        }
        missing_ids = [song_id for song_id in normalized_order if song_id not in active_by_id]
        if missing_ids:
            raise ValueError('Música manual não encontrada para reordenar.')

        current_sorted_active = sorted(
            active_rows,
            key=lambda row: (
                str(row.get('updated_at_utc') or ''),
                _coerce_int(row.get('id'), 0),
            ),
            reverse=True,
        )
        current_sorted_active.sort(
            key=lambda row: (
                _coerce_int(row.get('order_index'), 0) <= 0,
                _coerce_int(row.get('order_index'), 0) if _coerce_int(row.get('order_index'), 0) > 0 else 10**9,
            )
        )
        remaining_ids = [
            _coerce_int(row.get('id'), 0)
            for row in current_sorted_active
            if _coerce_int(row.get('id'), 0) not in seen_ids
        ]
        final_order = normalized_order + remaining_ids
        for index, song_id in enumerate(final_order, start=1):
            row = active_by_id.get(song_id)
            if row:
                row['order_index'] = index

        store['songs'] = normalized_rows
        _write_store(
            custom_songs_file,
            store,
            database_url=database_url,
            store_namespace=store_namespace,
        )

    return list_custom_songs(
        custom_songs_file,
        include_inactive=False,
        database_url=database_url,
        store_namespace=store_namespace,
    )
