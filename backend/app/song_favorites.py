from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from urllib.parse import quote_plus, urlparse, urlunparse

from pydantic import BaseModel

from .json_store_db import load_store, mutate_store, save_store
from .songs import detect_song_key_with_api, extract_plain_lyrics_from_chords_text, fetch_song_from_url


class SongFavoriteCreateRequest(BaseModel):
    url: str
    title: str = ''
    artist: str = ''
    source: str = ''
    source_label: str = ''
    image_url: str = ''
    spotify_url: str = ''
    youtube_url: str = ''
    lyrics_text: str = ''
    lyrics_source: str = ''
    lyrics_source_url: str = ''
    chords_text: str = ''
    chords_source: str = ''
    chords_source_url: str = ''
    chords_original_key: str = ''
    chords_selected_key: str = ''
    prefetch_chords_on_save: bool = False


class SongFavoriteReorderRequest(BaseModel):
    ordered_ids: list[int]


_STORE_LOCK = RLock()
_STORE_KEY = 'song_favorites'
_CIFRACLUB_HOST_SUFFIXES = ('cifraclub.com.br', 'cifraclub.com')
_CIFRAS_HOST_SUFFIXES = ('cifras.com.br',)


def _normalize_spaces(value: str | None) -> str:
    return ' '.join((value or '').split()).strip()


def _normalize_song_url_key(value: str | None) -> str:
    return _normalize_spaces(value).lower()


def _resolve_source_from_hostname(hostname: str) -> str:
    if any(hostname.endswith(suffix) for suffix in _CIFRACLUB_HOST_SUFFIXES):
        return 'cifraclub'
    if any(hostname.endswith(suffix) for suffix in _CIFRAS_HOST_SUFFIXES):
        return 'cifras'
    return ''


def _normalize_song_url(raw_url: str) -> tuple[str, str]:
    source_url = _normalize_spaces(raw_url)
    if not source_url:
        raise ValueError('Informe um link valido de cifra para salvar o favorito.')

    if '://' not in source_url:
        source_url = f'https://{source_url}'

    parsed = urlparse(source_url)
    if parsed.scheme not in ('http', 'https'):
        raise ValueError('Link invalido. Use http ou https.')

    hostname = (parsed.hostname or '').lower()
    source_from_url = _resolve_source_from_hostname(hostname)
    if source_from_url not in {'cifraclub', 'cifras'}:
        raise ValueError('A busca automatica aceita links do Cifra Club e do Cifras.com.br.')

    if not parsed.path or parsed.path == '/':
        raise ValueError('Link de musica invalido.')

    clean_path = parsed.path
    if source_from_url == 'cifraclub' and not clean_path.endswith('/'):
        clean_path = f'{clean_path}/'

    normalized = parsed._replace(
        netloc=hostname,
        path=clean_path,
        params='',
        query='',
        fragment='',
    )
    return urlunparse(normalized), source_from_url


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


def _normalize_usage_locations(raw_value: object) -> list[str]:
    raw_items = raw_value if isinstance(raw_value, list) else []
    normalized_items: list[str] = []
    seen: set[str] = set()
    for raw_item in raw_items:
        item = _normalize_spaces(str(raw_item))
        if not item:
            continue
        item_key = item.casefold()
        if item_key in seen:
            continue
        seen.add(item_key)
        normalized_items.append(item)
    normalized_items.sort(key=lambda value: value.casefold())
    return normalized_items


def _normalize_favorite_row(raw_row: dict[str, object]) -> dict[str, object]:
    raw_usage_locations = raw_row.get('usage_locations')
    if raw_usage_locations is None:
        raw_usage_locations = raw_row.get('usageLocations')
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
        'chords_selected_key': _normalize_spaces(str(raw_row.get('chords_selected_key') or '')),
        'chords_text': str(raw_row.get('chords_text') or ''),
        'order_index': max(
            _coerce_int(raw_row.get('order_index') or raw_row.get('orderIndex'), 0),
            0,
        ),
        'usage_locations': _normalize_usage_locations(raw_usage_locations),
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
        'chords_selected_key': row.get('chords_selected_key') or row.get('chords_original_key') or '',
        'chords_text': row.get('chords_text') or '',
        'usage_locations': _normalize_usage_locations(row.get('usage_locations')),
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
    source_url, source_from_url = _normalize_song_url(payload.url)
    source_url_key = _normalize_song_url_key(source_url)

    preloaded_chords_text = str(payload.chords_text or '').strip()
    preloaded_lyrics_text = str(payload.lyrics_text or '').strip()

    chord_song: dict[str, str] = {}
    should_prefetch_chords = bool(payload.prefetch_chords_on_save) and not preloaded_chords_text
    if should_prefetch_chords:
        try:
            chord_song = fetch_song_from_url(source_url)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        except RuntimeError as exc:
            raise RuntimeError(f'Falha ao carregar a cifra para favoritar: {exc}') from exc

    title = _normalize_spaces(payload.title) or _normalize_spaces(chord_song.get('title'))
    artist = _normalize_spaces(payload.artist) or _normalize_spaces(chord_song.get('artist'))
    source = _normalize_spaces(payload.source) or _normalize_spaces(chord_song.get('source')) or source_from_url
    source_label = _normalize_spaces(payload.source_label) or _normalize_spaces(chord_song.get('source_label'))
    image_url = _normalize_spaces(payload.image_url)
    spotify_url = _normalize_spaces(payload.spotify_url)
    youtube_url = _normalize_spaces(payload.youtube_url)

    chords_source = _normalize_spaces(payload.chords_source) or _normalize_spaces(chord_song.get('source')) or source
    chords_source_url = (
        _normalize_spaces(payload.chords_source_url)
        or _normalize_spaces(chord_song.get('url'))
        or source_url
    )
    chords_original_key = (
        _normalize_spaces(payload.chords_original_key)
        or _normalize_spaces(chord_song.get('original_key'))
    )
    if not chords_original_key:
        chords_original_key = detect_song_key_with_api(title, artist)
    chords_selected_key = _normalize_spaces(payload.chords_selected_key)
    chords_text = preloaded_chords_text or (chord_song.get('lyrics') or '').strip()
    lyrics_source = _normalize_spaces(payload.lyrics_source)
    lyrics_source_url = _normalize_spaces(payload.lyrics_source_url)
    lyrics_text = preloaded_lyrics_text
    try:
        if not lyrics_text and chords_text:
            lyrics_text = extract_plain_lyrics_from_chords_text(chords_text)
    except RuntimeError:
        lyrics_text = ''

    now_iso = _now_utc_iso()
    saved_row: dict[str, object] = {}

    def apply_upsert(raw_store: object) -> dict[str, object]:
        nonlocal saved_row
        store = _normalize_store(raw_store)
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

        local_title = title
        local_artist = artist
        local_source = source
        local_source_label = source_label
        local_image_url = image_url
        local_spotify_url = spotify_url
        local_youtube_url = youtube_url
        local_chords_source = chords_source
        local_chords_source_url = chords_source_url
        local_chords_original_key = chords_original_key
        local_chords_selected_key = chords_selected_key
        local_chords_text = chords_text
        local_lyrics_source = lyrics_source
        local_lyrics_source_url = lyrics_source_url
        local_lyrics_text = lyrics_text
        local_usage_locations: list[str] = []

        if existing_index >= 0:
            existing = _normalize_favorite_row(favorite_rows[existing_index])
            favorite_id = _coerce_int(existing.get('id'), 0)
            created_at_utc = str(existing.get('created_at_utc') or now_iso)
            order_index = max(_coerce_int(existing.get('order_index'), 0), 1)
        else:
            existing = {}
            favorite_id = _coerce_int(store.get('last_id'), 0) + 1
            created_at_utc = now_iso
            order_index = max_order + 1

        local_title = local_title or _normalize_spaces(str(existing.get('title') or ''))
        local_artist = local_artist or _normalize_spaces(str(existing.get('artist') or ''))
        local_source = local_source or _normalize_spaces(str(existing.get('source') or '')) or source_from_url
        local_source_label = local_source_label or _normalize_spaces(str(existing.get('source_label') or ''))
        local_image_url = local_image_url or _normalize_spaces(str(existing.get('image_url') or ''))
        local_spotify_url = local_spotify_url or _normalize_spaces(str(existing.get('spotify_url') or ''))
        local_youtube_url = local_youtube_url or _normalize_spaces(str(existing.get('youtube_url') or ''))
        local_chords_source = (
            local_chords_source
            or _normalize_spaces(str(existing.get('chords_source') or ''))
            or local_source
        )
        local_chords_source_url = (
            local_chords_source_url
            or _normalize_spaces(str(existing.get('chords_source_url') or ''))
            or source_url
        )
        local_chords_original_key = (
            local_chords_original_key
            or _normalize_spaces(str(existing.get('chords_original_key') or ''))
        )
        local_chords_selected_key = (
            local_chords_selected_key
            or _normalize_spaces(str(existing.get('chords_selected_key') or ''))
            or local_chords_original_key
        )
        local_chords_text = local_chords_text or str(existing.get('chords_text') or '').strip()
        local_lyrics_text = local_lyrics_text or str(existing.get('lyrics_text') or '').strip()
        local_lyrics_source = (
            local_lyrics_source
            or _normalize_spaces(str(existing.get('lyrics_source') or ''))
            or (local_chords_source if local_lyrics_text else '')
        )
        local_lyrics_source_url = (
            local_lyrics_source_url
            or _normalize_spaces(str(existing.get('lyrics_source_url') or ''))
            or (local_chords_source_url if local_lyrics_text else '')
        )
        local_usage_locations = _normalize_usage_locations(existing.get('usage_locations'))

        local_source_label = _resolve_source_label(local_source, local_source_label)
        if not local_title:
            local_title = 'Musica'
        if not local_spotify_url:
            local_spotify_url = _build_external_search_url('spotify', local_title, local_artist)
        if not local_youtube_url:
            local_youtube_url = _build_external_search_url('youtube', local_title, local_artist)

        row = {
            'id': favorite_id,
            'song_url': source_url,
            'title': local_title,
            'artist': local_artist,
            'source': local_source,
            'source_label': local_source_label,
            'image_url': local_image_url,
            'spotify_url': local_spotify_url,
            'youtube_url': local_youtube_url,
            'lyrics_source': local_lyrics_source,
            'lyrics_source_url': local_lyrics_source_url,
            'lyrics_text': local_lyrics_text,
            'chords_source': local_chords_source,
            'chords_source_url': local_chords_source_url,
            'chords_original_key': local_chords_original_key,
            'chords_selected_key': local_chords_selected_key,
            'chords_text': local_chords_text,
            'usage_locations': local_usage_locations,
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
        saved_row = row
        return store

    with _STORE_LOCK:
        if database_url:
            mutate_store(database_url, _STORE_KEY, apply_upsert)
        else:
            updated_store = apply_upsert(_read_store(favorites_file, database_url=None))
            _write_store(favorites_file, updated_store, database_url=None)

    return _row_to_payload(saved_row)


def delete_song_favorite(
    favorites_file: Path,
    url: str,
    database_url: str | None = None,
) -> bool:
    source_url = _normalize_spaces(url)
    if not source_url:
        raise ValueError('Informe um link valido de cifra para remover o favorito.')

    target_key = _normalize_song_url_key(source_url)
    removed = False

    def apply_remove(raw_store: object) -> dict[str, object]:
        nonlocal removed
        store = _normalize_store(raw_store)
        rows = store.get('favorites')
        favorite_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []

        kept_rows: list[dict[str, object]] = []
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
        return store

    with _STORE_LOCK:
        if database_url:
            mutate_store(database_url, _STORE_KEY, apply_remove)
        else:
            updated_store = apply_remove(_read_store(favorites_file, database_url=None))
            if removed:
                _write_store(favorites_file, updated_store, database_url=None)

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

    reordered_payload: list[dict[str, object]] = []

    def apply_reorder(raw_store: object) -> dict[str, object]:
        nonlocal reordered_payload
        store = _normalize_store(raw_store)
        rows = store.get('favorites')
        favorite_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []

        normalized_rows = [
            _normalize_favorite_row(item)
            for item in favorite_rows
            if isinstance(item, dict) and _normalize_spaces(str(item.get('song_url') or item.get('url') or ''))
        ]
        if not normalized_rows:
            store['favorites'] = normalized_rows
            reordered_payload = []
            return store

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
        reordered_payload = [_row_to_payload(row) for row in normalized_rows]

        store['favorites'] = normalized_rows
        return store

    with _STORE_LOCK:
        if database_url:
            mutate_store(database_url, _STORE_KEY, apply_reorder)
        else:
            updated_store = apply_reorder(_read_store(favorites_file, database_url=None))
            _write_store(favorites_file, updated_store, database_url=None)

    return reordered_payload


def set_song_favorite_usage_by_id(
    favorites_file: Path,
    favorite_id: int,
    usage_locations: list[str],
    database_url: str | None = None,
) -> dict[str, object] | None:
    safe_favorite_id = _coerce_int(favorite_id, 0)
    if safe_favorite_id <= 0:
        raise ValueError('Favorito invalido para atualizar uso.')

    normalized_usage_locations = _normalize_usage_locations(usage_locations)
    saved_row: dict[str, object] | None = None
    changed = False

    def apply_update(raw_store: object) -> dict[str, object]:
        nonlocal saved_row, changed
        store = _normalize_store(raw_store)
        rows = store.get('favorites')
        favorite_rows: list[dict[str, object]] = rows if isinstance(rows, list) else []
        target_index = next(
            (
                index
                for index, item in enumerate(favorite_rows)
                if isinstance(item, dict) and _coerce_int(item.get('id'), 0) == safe_favorite_id
            ),
            -1,
        )
        if target_index < 0:
            saved_row = None
            changed = False
            return store

        row = _normalize_favorite_row(favorite_rows[target_index])
        current_usage_locations = _normalize_usage_locations(row.get('usage_locations'))
        if current_usage_locations == normalized_usage_locations:
            saved_row = row
            changed = False
            return store

        row['usage_locations'] = normalized_usage_locations
        row['updated_at_utc'] = _now_utc_iso()
        favorite_rows[target_index] = row
        store['favorites'] = favorite_rows
        saved_row = row
        changed = True
        return store

    with _STORE_LOCK:
        if database_url:
            mutate_store(database_url, _STORE_KEY, apply_update)
        else:
            updated_store = apply_update(_read_store(favorites_file, database_url=None))
            if changed:
                _write_store(favorites_file, updated_store, database_url=None)

    return _row_to_payload(saved_row) if saved_row else None
