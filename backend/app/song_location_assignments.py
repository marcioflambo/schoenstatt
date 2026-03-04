from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from pydantic import BaseModel

from .json_store_db import load_store, save_store
from .song_favorites import SongFavoriteCreateRequest, save_song_favorite


class SongLocationAssignmentUpsertRequest(BaseModel):
    location_id: str
    location_label: str = ''
    location_path: list[str] = []
    song_title: str = ''
    song_artist: str = ''
    song_url: str = ''
    source: str = ''
    source_label: str = ''
    image_url: str = ''
    lyrics_text: str = ''
    lyrics_source: str = ''
    lyrics_source_url: str = ''


_STORE_LOCK = RLock()
_STORE_KEY = 'song_location_assignments'
_LOGGER = logging.getLogger("uvicorn.error")


def _normalize_spaces(value: str | None) -> str:
    return ' '.join((value or '').split()).strip()


def _resolve_store_key(store_namespace: str | None = None) -> str:
    safe_namespace = _normalize_spaces(store_namespace)
    if not safe_namespace:
        return _STORE_KEY
    return f'{_STORE_KEY}:{safe_namespace}'


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_store() -> dict[str, object]:
    return {
        'assignments': [],
    }


def _normalize_assignment_row(raw_row: dict[str, object]) -> dict[str, object]:
    location_id = _normalize_spaces(str(raw_row.get('location_id') or raw_row.get('locationId') or ''))
    location_label = _normalize_spaces(str(raw_row.get('location_label') or raw_row.get('locationLabel') or ''))
    raw_path = raw_row.get('location_path')
    if not isinstance(raw_path, list):
        raw_path = raw_row.get('locationPath')
    location_path = [
        _normalize_spaces(str(item))
        for item in raw_path
        if isinstance(raw_path, list) and _normalize_spaces(str(item))
    ] if isinstance(raw_path, list) else []

    return {
        'assignment_key': location_id,
        'location_id': location_id,
        'location_label': location_label,
        'location_path': location_path,
        'song_title': _normalize_spaces(str(raw_row.get('song_title') or raw_row.get('songTitle') or '')),
        'song_artist': _normalize_spaces(str(raw_row.get('song_artist') or raw_row.get('songArtist') or '')),
        'song_url': _normalize_spaces(str(raw_row.get('song_url') or raw_row.get('songUrl') or '')),
        'source': _normalize_spaces(str(raw_row.get('source') or '')),
        'source_label': _normalize_spaces(str(raw_row.get('source_label') or raw_row.get('sourceLabel') or '')),
        'image_url': _normalize_spaces(str(raw_row.get('image_url') or raw_row.get('imageUrl') or '')),
        'lyrics_text': str(raw_row.get('lyrics_text') or raw_row.get('lyricsText') or ''),
        'lyrics_source': _normalize_spaces(str(raw_row.get('lyrics_source') or raw_row.get('lyricsSource') or '')),
        'lyrics_source_url': _normalize_spaces(str(raw_row.get('lyrics_source_url') or raw_row.get('lyricsSourceUrl') or '')),
        'created_at_utc': str(raw_row.get('created_at_utc') or raw_row.get('createdAtUtc') or ''),
        'updated_at_utc': str(raw_row.get('updated_at_utc') or raw_row.get('updatedAtUtc') or ''),
    }


def _normalize_store(raw_store: object) -> dict[str, object]:
    if not isinstance(raw_store, dict):
        return _empty_store()

    raw_assignments = raw_store.get('assignments')
    assignment_rows: list[dict[str, object]] = []
    if isinstance(raw_assignments, list):
        for item in raw_assignments:
            if isinstance(item, dict):
                row = _normalize_assignment_row(item)
                if row['location_id']:
                    assignment_rows.append(row)

    deduped: dict[str, dict[str, object]] = {}
    for row in assignment_rows:
        location_id = str(row.get('location_id') or '')
        if not location_id:
            continue
        previous = deduped.get(location_id)
        if not previous:
            deduped[location_id] = row
            continue
        if str(row.get('updated_at_utc') or '') >= str(previous.get('updated_at_utc') or ''):
            deduped[location_id] = row

    return {
        'assignments': list(deduped.values()),
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
        raise RuntimeError(f'Arquivo de atribuicoes por local invalido: {file_path}') from exc
    except OSError as exc:
        raise RuntimeError(f'Falha ao ler arquivo de atribuicoes por local: {exc}') from exc

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
        raise RuntimeError(f'Falha ao salvar arquivo de atribuicoes por local: {exc}') from exc
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


def _row_to_payload(row: dict[str, object]) -> dict[str, object]:
    return {
        'assignment_key': row.get('assignment_key') or row.get('location_id') or '',
        'location_id': row.get('location_id') or '',
        'location_label': row.get('location_label') or '',
        'location_path': row.get('location_path') if isinstance(row.get('location_path'), list) else [],
        'song_title': row.get('song_title') or '',
        'song_artist': row.get('song_artist') or '',
        'song_url': row.get('song_url') or '',
        'source': row.get('source') or '',
        'source_label': row.get('source_label') or '',
        'image_url': row.get('image_url') or '',
        'lyrics_text': row.get('lyrics_text') or '',
        'lyrics_source': row.get('lyrics_source') or '',
        'lyrics_source_url': row.get('lyrics_source_url') or '',
        'created_at_utc': row.get('created_at_utc') or None,
        'updated_at_utc': row.get('updated_at_utc') or None,
    }


def list_song_location_assignments(
    assignments_file: Path,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> list[dict[str, object]]:
    with _STORE_LOCK:
        store = _read_store(
            assignments_file,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('assignments')
        assignment_rows = rows if isinstance(rows, list) else []

    normalized_rows = [
        _normalize_assignment_row(item)
        for item in assignment_rows
        if isinstance(item, dict)
    ]
    normalized_rows = [
        row
        for row in normalized_rows
        if row['location_id']
    ]
    normalized_rows.sort(
        key=lambda row: (
            ' > '.join(row.get('location_path') or []),
            str(row.get('location_label') or ''),
            str(row.get('location_id') or ''),
        )
    )
    return [_row_to_payload(row) for row in normalized_rows]


def upsert_song_location_assignment(
    assignments_file: Path,
    payload: SongLocationAssignmentUpsertRequest,
    favorites_file: Path | None = None,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> dict[str, object]:
    location_id = _normalize_spaces(payload.location_id)
    if not location_id:
        raise ValueError('Informe o local para vincular a musica.')

    song_title = _normalize_spaces(payload.song_title)
    song_url = _normalize_spaces(payload.song_url)
    if not song_title and not song_url:
        raise ValueError('Informe a musica para vincular ao local.')

    location_label = _normalize_spaces(payload.location_label)
    location_path = [
        _normalize_spaces(str(item))
        for item in payload.location_path
        if _normalize_spaces(str(item))
    ]
    now_iso = _now_utc_iso()

    with _STORE_LOCK:
        store = _read_store(
            assignments_file,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('assignments')
        assignment_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []

        target_index = next(
            (
                index
                for index, item in enumerate(assignment_rows)
                if isinstance(item, dict)
                and _normalize_spaces(str(item.get('location_id') or item.get('locationId') or '')) == location_id
            ),
            -1,
        )

        if target_index >= 0:
            existing = _normalize_assignment_row(assignment_rows[target_index])
            created_at_utc = str(existing.get('created_at_utc') or now_iso)
        else:
            created_at_utc = now_iso

        row = {
            'assignment_key': location_id,
            'location_id': location_id,
            'location_label': location_label,
            'location_path': location_path,
            'song_title': song_title,
            'song_artist': _normalize_spaces(payload.song_artist),
            'song_url': song_url,
            'source': _normalize_spaces(payload.source),
            'source_label': _normalize_spaces(payload.source_label),
            'image_url': _normalize_spaces(payload.image_url),
            'lyrics_text': str(payload.lyrics_text or ''),
            'lyrics_source': _normalize_spaces(payload.lyrics_source),
            'lyrics_source_url': _normalize_spaces(payload.lyrics_source_url),
            'created_at_utc': created_at_utc,
            'updated_at_utc': now_iso,
        }

        if target_index >= 0:
            assignment_rows[target_index] = row
        else:
            assignment_rows.append(row)

        store['assignments'] = assignment_rows
        _write_store(
            assignments_file,
            store,
            database_url=database_url,
            store_namespace=store_namespace,
        )

    assignment_payload = _row_to_payload(row)

    if favorites_file is not None and song_url:
        try:
            save_song_favorite(
                favorites_file,
                SongFavoriteCreateRequest(
                    url=song_url,
                    title=song_title,
                    artist=_normalize_spaces(payload.song_artist),
                    source=_normalize_spaces(payload.source),
                    source_label=_normalize_spaces(payload.source_label),
                    image_url=_normalize_spaces(payload.image_url),
                    lyrics_text=str(payload.lyrics_text or ''),
                    lyrics_source=_normalize_spaces(payload.lyrics_source),
                    lyrics_source_url=_normalize_spaces(payload.lyrics_source_url),
                    prefetch_chords_on_save=False,
                ),
                database_url=database_url,
                store_namespace=store_namespace,
            )
        except ValueError:
            pass
        except Exception as exc:  # pragma: no cover - defensive fallback
            _LOGGER.warning(
                "Falha ao sincronizar favorito a partir do local (location_id=%s, url=%s): %s",
                location_id,
                song_url,
                exc,
            )

    return assignment_payload


def delete_song_location_assignment(
    assignments_file: Path,
    location_id: str,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> bool:
    safe_location_id = _normalize_spaces(location_id)
    if not safe_location_id:
        raise ValueError('Informe o local para remover a musica.')

    with _STORE_LOCK:
        store = _read_store(
            assignments_file,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('assignments')
        assignment_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []

        normalized_rows = [
            _normalize_assignment_row(item)
            for item in assignment_rows
            if isinstance(item, dict)
        ]
        kept_rows = [
            row
            for row in normalized_rows
            if str(row.get('location_id') or '') != safe_location_id
        ]
        removed = len(kept_rows) != len(normalized_rows)
        if removed:
            store['assignments'] = kept_rows
            _write_store(
                assignments_file,
                store,
                database_url=database_url,
                store_namespace=store_namespace,
            )

    return removed


def delete_song_location_assignments_by_location_ids(
    assignments_file: Path,
    location_ids: list[str] | set[str] | tuple[str, ...],
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> dict[str, object]:
    normalized_ids = {
        _normalize_spaces(str(raw_id))
        for raw_id in location_ids
        if _normalize_spaces(str(raw_id))
    }
    if not normalized_ids:
        return {
            'removed': False,
            'count': 0,
            'removed_location_ids': [],
        }

    with _STORE_LOCK:
        store = _read_store(
            assignments_file,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('assignments')
        assignment_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []
        normalized_rows = [
            _normalize_assignment_row(item)
            for item in assignment_rows
            if isinstance(item, dict)
        ]

        removed_location_ids = sorted({
            str(row.get('location_id') or '')
            for row in normalized_rows
            if str(row.get('location_id') or '') in normalized_ids
        })
        kept_rows = [
            row
            for row in normalized_rows
            if str(row.get('location_id') or '') not in normalized_ids
        ]

        removed_count = len(normalized_rows) - len(kept_rows)
        removed = removed_count > 0
        if removed:
            store['assignments'] = kept_rows
            _write_store(
                assignments_file,
                store,
                database_url=database_url,
                store_namespace=store_namespace,
            )

    return {
        'removed': removed,
        'count': removed_count,
        'removed_location_ids': removed_location_ids,
    }
