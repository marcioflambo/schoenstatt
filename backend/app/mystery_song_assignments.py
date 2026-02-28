from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from pydantic import BaseModel

from .json_store_db import load_store, save_store

class MysterySongAssignmentUpsertRequest(BaseModel):
    group_title: str
    group_day: str = ''
    mystery_title: str
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
_STORE_KEY = 'mystery_song_assignments'


def _normalize_spaces(value: str | None) -> str:
    return ' '.join((value or '').split()).strip()


def _normalize_mystery_title(value: str | None) -> str:
    title = _normalize_spaces(value)
    if not title:
        return ''
    return re.sub(r'^\d+\s*[ºo]\s+', '', title, flags=re.IGNORECASE).strip()


def _normalize_key_token(value: str | None) -> str:
    normalized = _normalize_spaces(value)
    if not normalized:
        return ''
    ascii_folded = unicodedata.normalize('NFD', normalized)
    ascii_folded = ''.join(char for char in ascii_folded if unicodedata.category(char) != 'Mn')
    return _normalize_spaces(ascii_folded).lower()


def _canonical_group_key(value: str | None) -> str:
    token = _normalize_key_token(value).replace('misterios', '')
    return _normalize_spaces(token)


def _build_assignment_key(group_title: str, mystery_title: str) -> str:
    return f'{_canonical_group_key(group_title)}|{_normalize_key_token(_normalize_mystery_title(mystery_title))}'


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_store() -> dict[str, object]:
    return {
        'assignments': [],
    }


def _normalize_assignment_row(raw_row: dict[str, object]) -> dict[str, object]:
    group_title = _normalize_spaces(str(raw_row.get('group_title') or raw_row.get('groupTitle') or ''))
    group_day = _normalize_spaces(str(raw_row.get('group_day') or raw_row.get('groupDay') or ''))
    mystery_title = _normalize_mystery_title(str(raw_row.get('mystery_title') or raw_row.get('mysteryTitle') or ''))
    assignment_key = _normalize_spaces(str(raw_row.get('assignment_key') or raw_row.get('assignmentKey') or ''))
    if not assignment_key and group_title and mystery_title:
        assignment_key = _build_assignment_key(group_title, mystery_title)

    return {
        'assignment_key': assignment_key,
        'group_key': _canonical_group_key(group_title),
        'group_title': group_title,
        'group_day': group_day,
        'mystery_key': _normalize_key_token(mystery_title),
        'mystery_title': mystery_title,
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
                if row['assignment_key'] and row['group_title'] and row['mystery_title']:
                    assignment_rows.append(row)

    deduped: dict[str, dict[str, object]] = {}
    for row in assignment_rows:
        assignment_key = str(row.get('assignment_key') or '')
        if not assignment_key:
            continue
        previous = deduped.get(assignment_key)
        if not previous:
            deduped[assignment_key] = row
            continue
        if str(row.get('updated_at_utc') or '') >= str(previous.get('updated_at_utc') or ''):
            deduped[assignment_key] = row

    return {
        'assignments': list(deduped.values()),
    }


def _read_store(file_path: Path, database_url: str | None = None) -> dict[str, object]:
    if database_url:
        database_store = load_store(database_url, _STORE_KEY)
        if database_store is not None:
            return _normalize_store(database_store)

        if file_path.exists():
            file_store = _read_store(file_path, database_url=None)
            save_store(database_url, _STORE_KEY, _normalize_store(file_store))
            return _normalize_store(file_store)

        return _empty_store()

    if not file_path.exists():
        return _empty_store()

    try:
        raw = json.loads(file_path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'Arquivo de atribuicoes de musicas invalido: {file_path}') from exc
    except OSError as exc:
        raise RuntimeError(f'Falha ao ler arquivo de atribuicoes de musicas: {exc}') from exc

    return _normalize_store(raw)


def _write_store(file_path: Path, store: dict[str, object], database_url: str | None = None) -> None:
    normalized_store = _normalize_store(store)
    if database_url:
        save_store(database_url, _STORE_KEY, normalized_store)
        return

    file_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = file_path.with_suffix(f'{file_path.suffix}.tmp')

    payload = json.dumps(normalized_store, ensure_ascii=False, indent=2)
    try:
        temp_path.write_text(payload, encoding='utf-8')
        temp_path.replace(file_path)
    except OSError as exc:
        raise RuntimeError(f'Falha ao salvar arquivo de atribuicoes de musicas: {exc}') from exc
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


def _row_to_payload(row: dict[str, object]) -> dict[str, object]:
    return {
        'assignment_key': row.get('assignment_key') or '',
        'group_key': row.get('group_key') or '',
        'group_title': row.get('group_title') or '',
        'group_day': row.get('group_day') or '',
        'mystery_key': row.get('mystery_key') or '',
        'mystery_title': row.get('mystery_title') or '',
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


def list_mystery_song_assignments(
    assignments_file: Path,
    database_url: str | None = None,
) -> list[dict[str, object]]:
    with _STORE_LOCK:
        store = _read_store(assignments_file, database_url=database_url)
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
        if row['assignment_key'] and row['group_title'] and row['mystery_title']
    ]
    normalized_rows.sort(
        key=lambda row: (
            str(row.get('group_title') or ''),
            str(row.get('mystery_title') or ''),
        )
    )
    return [_row_to_payload(row) for row in normalized_rows]


def upsert_mystery_song_assignment(
    assignments_file: Path,
    payload: MysterySongAssignmentUpsertRequest,
    database_url: str | None = None,
) -> dict[str, object]:
    group_title = _normalize_spaces(payload.group_title)
    mystery_title = _normalize_mystery_title(payload.mystery_title)
    if not group_title or not mystery_title:
        raise ValueError('Informe o grupo e o misterio para vincular a musica.')

    song_title = _normalize_spaces(payload.song_title)
    song_url = _normalize_spaces(payload.song_url)
    if not song_title and not song_url:
        raise ValueError('Informe a musica para vincular ao misterio.')

    assignment_key = _build_assignment_key(group_title, mystery_title)
    now_iso = _now_utc_iso()

    with _STORE_LOCK:
        store = _read_store(assignments_file, database_url=database_url)
        rows = store.get('assignments')
        assignment_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []

        target_index = next(
            (
                index
                for index, item in enumerate(assignment_rows)
                if isinstance(item, dict)
                and _normalize_spaces(str(item.get('assignment_key') or '')) == assignment_key
            ),
            -1,
        )

        if target_index >= 0:
            existing = _normalize_assignment_row(assignment_rows[target_index])
            created_at_utc = str(existing.get('created_at_utc') or now_iso)
        else:
            created_at_utc = now_iso

        row = {
            'assignment_key': assignment_key,
            'group_key': _canonical_group_key(group_title),
            'group_title': group_title,
            'group_day': _normalize_spaces(payload.group_day),
            'mystery_key': _normalize_key_token(mystery_title),
            'mystery_title': mystery_title,
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
        _write_store(assignments_file, store, database_url=database_url)

    return _row_to_payload(row)


def delete_mystery_song_assignment(
    assignments_file: Path,
    group_title: str,
    mystery_title: str,
    database_url: str | None = None,
) -> bool:
    safe_group_title = _normalize_spaces(group_title)
    safe_mystery_title = _normalize_mystery_title(mystery_title)
    if not safe_group_title or not safe_mystery_title:
        raise ValueError('Informe o grupo e o misterio para remover a musica do misterio.')

    assignment_key = _build_assignment_key(safe_group_title, safe_mystery_title)

    with _STORE_LOCK:
        store = _read_store(assignments_file, database_url=database_url)
        rows = store.get('assignments')
        assignment_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []

        normalized_rows = [
            _normalize_assignment_row(item)
            for item in assignment_rows
            if isinstance(item, dict)
        ]
        normalized_rows = [
            row
            for row in normalized_rows
            if row['assignment_key'] and row['group_title'] and row['mystery_title']
        ]

        kept_rows = [
            row
            for row in normalized_rows
            if str(row.get('assignment_key') or '') != assignment_key
        ]
        removed = len(kept_rows) != len(normalized_rows)

        if removed:
            store['assignments'] = kept_rows
            _write_store(assignments_file, store, database_url=database_url)

    return removed
