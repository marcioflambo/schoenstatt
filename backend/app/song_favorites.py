from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from urllib.parse import quote_plus

from pydantic import BaseModel

from .json_store_db import load_store, save_store
from .songs import fetch_lyrics_from_letras, fetch_song_from_url


class SongFavoriteCreateRequest(BaseModel):
    url: str
    title: str = ''
    artist: str = ''
    source: str = ''
    source_label: str = ''
    image_url: str = ''
    spotify_url: str = ''
    youtube_url: str = ''


class SongFavoriteReorderRequest(BaseModel):
    ordered_ids: list[int]


_STORE_LOCK = RLock()
_STORE_KEY = 'song_favorites'


def _normalize_spaces(value: str | None) -> str:
    return ' '.join((value or '').split()).strip()


def _normalize_song_url_key(value: str | None) -> str:
    return _normalize_spaces(value).lower()


def _build_external_search_url(platform: str, title: str, artist: str) -> str:
    query = _normalize_spaces(f'{title} {artist}')
    if not query:
        return ''
    encoded = quote_plus(query)
    if platform == 'spotify':
        return f'https://open.spotify.com/search/{encoded}'
    return f'https://www.youtube.com/results?search_query={encoded}'


def _resolve_source_label(source: str, explicit_label: str) -> str:
    if explicit_label:
        return explicit_label
    if source == 'cifraclub':
        return 'Cifra Club'
    if source == 'letras':
        return 'Letras.mus.br'
    return 'Cifras'


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_store() -> dict[str, object]:
    return {
        'last_id': 0,
        'favorites': [],
    }


def _coerce_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_favorite_row(raw_row: dict[str, object]) -> dict[str, object]:
    return {
        'id': _coerce_int(raw_row.get('id'), 0),
        'song_url': _normalize_spaces(str(raw_row.get('song_url') or raw_row.get('url') or '')),
        'title': _normalize_spaces(str(raw_row.get('title') or '')),
        'artist': _normalize_spaces(str(raw_row.get('artist') or '')),
        'source': _normalize_spaces(str(raw_row.get('source') or '')),
        'source_label': _normalize_spaces(str(raw_row.get('source_label') or '')),
        'image_url': _normalize_spaces(str(raw_row.get('image_url') or '')),
        'spotify_url': _normalize_spaces(str(raw_row.get('spotify_url') or '')),
        'youtube_url': _normalize_spaces(str(raw_row.get('youtube_url') or '')),
        'lyrics_source': _normalize_spaces(str(raw_row.get('lyrics_source') or '')),
        'lyrics_source_url': _normalize_spaces(str(raw_row.get('lyrics_source_url') or '')),
        'lyrics_text': str(raw_row.get('lyrics_text') or ''),
        'chords_source': _normalize_spaces(str(raw_row.get('chords_source') or '')),
        'chords_source_url': _normalize_spaces(str(raw_row.get('chords_source_url') or '')),
        'chords_original_key': _normalize_spaces(str(raw_row.get('chords_original_key') or '')),
        'chords_text': str(raw_row.get('chords_text') or ''),
        'order_index': max(
            _coerce_int(raw_row.get('order_index') or raw_row.get('orderIndex'), 0),
            0,
        ),
        'created_at_utc': str(raw_row.get('created_at_utc') or ''),
        'updated_at_utc': str(raw_row.get('updated_at_utc') or ''),
    }


def _normalize_store(raw_store: object) -> dict[str, object]:
    if not isinstance(raw_store, dict):
        return _empty_store()

    raw_favorites = raw_store.get('favorites')
    favorite_rows: list[dict[str, object]] = []
    if isinstance(raw_favorites, list):
        for item in raw_favorites:
            if isinstance(item, dict):
                row = _normalize_favorite_row(item)
                if row['song_url']:
                    favorite_rows.append(row)

    max_id = 0
    for row in favorite_rows:
        max_id = max(max_id, _coerce_int(row.get('id'), 0))

    # Backfill missing order indexes keeping the current recency-based order.
    max_order = max((_coerce_int(row.get('order_index'), 0) for row in favorite_rows), default=0)
    next_order = max_order + 1
    for row in sorted(
        favorite_rows,
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
        'favorites': favorite_rows,
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
        raise RuntimeError(f'Arquivo de favoritos invalido: {file_path}') from exc
    except OSError as exc:
        raise RuntimeError(f'Falha ao ler arquivo de favoritos: {exc}') from exc

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
        raise RuntimeError(f'Falha ao salvar arquivo de favoritos: {exc}') from exc
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


def _row_to_payload(row: dict[str, object]) -> dict[str, object]:
    lyrics_text = _normalize_spaces(str(row.get('lyrics_text') or ''))
    chords_text = _normalize_spaces(str(row.get('chords_text') or ''))

    return {
        'id': _coerce_int(row.get('id'), 0),
        'order_index': _coerce_int(row.get('order_index'), 0),
        'url': row.get('song_url') or '',
        'title': row.get('title') or '',
        'artist': row.get('artist') or '',
        'source': row.get('source') or '',
        'source_label': row.get('source_label') or '',
        'image_url': row.get('image_url') or '',
        'spotify_url': row.get('spotify_url') or '',
        'youtube_url': row.get('youtube_url') or '',
        'lyrics_source': row.get('lyrics_source') or '',
        'lyrics_source_url': row.get('lyrics_source_url') or '',
        'lyrics_text': row.get('lyrics_text') or '',
        'chords_source': row.get('chords_source') or '',
        'chords_source_url': row.get('chords_source_url') or '',
        'chords_original_key': row.get('chords_original_key') or '',
        'chords_text': row.get('chords_text') or '',
        'has_lyrics': bool(lyrics_text),
        'has_chords': bool(chords_text),
        'created_at_utc': row.get('created_at_utc') or None,
        'updated_at_utc': row.get('updated_at_utc') or None,
    }


def list_song_favorites(
    favorites_file: Path,
    database_url: str | None = None,
) -> list[dict[str, object]]:
    with _STORE_LOCK:
        store = _read_store(favorites_file, database_url=database_url)
        rows = store.get('favorites')
        favorite_rows = rows if isinstance(rows, list) else []

    normalized_rows = [
        _normalize_favorite_row(item)
        for item in favorite_rows
        if isinstance(item, dict) and _normalize_spaces(str(item.get('song_url') or item.get('url') or ''))
    ]
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


def save_song_favorite(
    favorites_file: Path,
    payload: SongFavoriteCreateRequest,
    database_url: str | None = None,
) -> dict[str, object]:
    source_url = _normalize_spaces(payload.url)
    if not source_url:
        raise ValueError('Informe um link valido de cifra para salvar o favorito.')
    source_url_key = _normalize_song_url_key(source_url)

    try:
        chord_song = fetch_song_from_url(source_url)
    except ValueError as exc:
        raise ValueError(str(exc)) from exc
    except RuntimeError as exc:
        raise RuntimeError(f'Falha ao carregar a cifra para favoritar: {exc}') from exc

    title = _normalize_spaces(payload.title) or _normalize_spaces(chord_song.get('title'))
    artist = _normalize_spaces(payload.artist) or _normalize_spaces(chord_song.get('artist'))
    source = _normalize_spaces(payload.source) or _normalize_spaces(chord_song.get('source'))
    source_label = _resolve_source_label(
        source,
        _normalize_spaces(payload.source_label) or _normalize_spaces(chord_song.get('source_label')),
    )
    image_url = _normalize_spaces(payload.image_url)
    spotify_url = _normalize_spaces(payload.spotify_url) or _build_external_search_url('spotify', title, artist)
    youtube_url = _normalize_spaces(payload.youtube_url) or _build_external_search_url('youtube', title, artist)

    lyrics_source = ''
    lyrics_source_url = ''
    lyrics_text = ''
    try:
        lyrics_song = fetch_lyrics_from_letras(title, artist, source_url)
        lyrics_source = _normalize_spaces(lyrics_song.get('source'))
        lyrics_source_url = _normalize_spaces(lyrics_song.get('url'))
        lyrics_text = (lyrics_song.get('lyrics') or '').strip()
    except Exception:
        # Keep favorite even when lyrics lookup fails.
        lyrics_source = 'letras'

    chords_source = _normalize_spaces(chord_song.get('source')) or source
    chords_source_url = _normalize_spaces(chord_song.get('url')) or source_url
    chords_original_key = _normalize_spaces(chord_song.get('original_key'))
    chords_text = (chord_song.get('lyrics') or '').strip()

    if not title:
        title = 'Musica'

    now_iso = _now_utc_iso()
    with _STORE_LOCK:
        store = _read_store(favorites_file, database_url=database_url)
        rows = store.get('favorites')
        favorite_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []
        max_order = max(
            (_coerce_int(item.get('order_index'), 0) for item in favorite_rows if isinstance(item, dict)),
            default=0,
        )

        existing_index = next(
            (
                index
                for index, item in enumerate(favorite_rows)
                if (
                    isinstance(item, dict)
                    and _normalize_song_url_key(str(item.get('song_url') or item.get('url') or '')) == source_url_key
                )
            ),
            -1,
        )

        if existing_index >= 0:
            existing = _normalize_favorite_row(favorite_rows[existing_index])
            favorite_id = _coerce_int(existing.get('id'), 0)
            created_at_utc = str(existing.get('created_at_utc') or now_iso)
            order_index = max(_coerce_int(existing.get('order_index'), 0), 1)
        else:
            favorite_id = _coerce_int(store.get('last_id'), 0) + 1
            created_at_utc = now_iso
            order_index = max_order + 1

        row = {
            'id': favorite_id,
            'song_url': source_url,
            'title': title,
            'artist': artist,
            'source': source,
            'source_label': source_label,
            'image_url': image_url,
            'spotify_url': spotify_url,
            'youtube_url': youtube_url,
            'lyrics_source': lyrics_source,
            'lyrics_source_url': lyrics_source_url,
            'lyrics_text': lyrics_text,
            'chords_source': chords_source,
            'chords_source_url': chords_source_url,
            'chords_original_key': chords_original_key,
            'chords_text': chords_text,
            'order_index': order_index,
            'created_at_utc': created_at_utc,
            'updated_at_utc': now_iso,
        }

        if existing_index >= 0:
            favorite_rows[existing_index] = row
        else:
            favorite_rows.append(row)

        store['last_id'] = max(_coerce_int(store.get('last_id'), 0), favorite_id)
        store['favorites'] = favorite_rows
        _write_store(favorites_file, store, database_url=database_url)

    return _row_to_payload(row)


def delete_song_favorite(
    favorites_file: Path,
    url: str,
    database_url: str | None = None,
) -> bool:
    source_url = _normalize_spaces(url)
    if not source_url:
        raise ValueError('Informe um link valido de cifra para remover o favorito.')

    target_key = _normalize_song_url_key(source_url)
    with _STORE_LOCK:
        store = _read_store(favorites_file, database_url=database_url)
        rows = store.get('favorites')
        favorite_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []

        kept_rows: list[dict[str, object]] = []
        removed = False
        for item in favorite_rows:
            if not isinstance(item, dict):
                continue
            row_url = str(item.get('song_url') or item.get('url') or '')
            if _normalize_song_url_key(row_url) == target_key:
                removed = True
                continue
            kept_rows.append(item)

        if removed:
            store['favorites'] = kept_rows
            _write_store(favorites_file, store, database_url=database_url)

    return removed


def reorder_song_favorites(
    favorites_file: Path,
    ordered_ids: list[int],
    database_url: str | None = None,
) -> list[dict[str, object]]:
    seen_ids: set[int] = set()
    normalized_order: list[int] = []
    for raw_id in ordered_ids:
        favorite_id = _coerce_int(raw_id, 0)
        if favorite_id <= 0:
            raise ValueError('Lista de ordenacao invalida.')
        if favorite_id in seen_ids:
            raise ValueError('Lista de ordenacao invalida.')
        seen_ids.add(favorite_id)
        normalized_order.append(favorite_id)

    with _STORE_LOCK:
        store = _read_store(favorites_file, database_url=database_url)
        rows = store.get('favorites')
        favorite_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []

        normalized_rows = [
            _normalize_favorite_row(item)
            for item in favorite_rows
            if isinstance(item, dict) and _normalize_spaces(str(item.get('song_url') or item.get('url') or ''))
        ]
        if not normalized_rows:
            store['favorites'] = normalized_rows
            _write_store(favorites_file, store, database_url=database_url)
            return []

        favorites_by_id = {
            _coerce_int(row.get('id'), 0): row
            for row in normalized_rows
        }
        missing_ids = [favorite_id for favorite_id in normalized_order if favorite_id not in favorites_by_id]
        if missing_ids:
            raise ValueError('Favorito nao encontrado para reordenar.')

        current_sorted_rows = sorted(
            normalized_rows,
            key=lambda row: (
                str(row.get('updated_at_utc') or ''),
                _coerce_int(row.get('id'), 0),
            ),
            reverse=True,
        )
        current_sorted_rows.sort(
            key=lambda row: (
                _coerce_int(row.get('order_index'), 0) <= 0,
                _coerce_int(row.get('order_index'), 0) if _coerce_int(row.get('order_index'), 0) > 0 else 10**9,
            )
        )
        remaining_ids = [
            _coerce_int(row.get('id'), 0)
            for row in current_sorted_rows
            if _coerce_int(row.get('id'), 0) not in seen_ids
        ]
        final_order = normalized_order + remaining_ids
        for index, favorite_id in enumerate(final_order, start=1):
            row = favorites_by_id.get(favorite_id)
            if row:
                row['order_index'] = index

        store['favorites'] = normalized_rows
        _write_store(favorites_file, store, database_url=database_url)

    return list_song_favorites(favorites_file, database_url=database_url)
