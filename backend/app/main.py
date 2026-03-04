from __future__ import annotations

from hmac import compare_digest
from pathlib import Path
import unicodedata

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .auth import (
    AuthAccountUpdateRequest,
    AuthLoginRequest,
    AuthRegisterRequest,
    delete_authenticated_user,
    get_authenticated_user,
    login_user,
    logout_user,
    register_user,
    update_authenticated_user,
)
from .config import PROJECT_DIR, settings
from .custom_songs import (
    CustomSongReorderRequest,
    CustomSongUpsertRequest,
    create_custom_song,
    delete_custom_song,
    list_custom_songs,
    reorder_custom_songs,
    restore_custom_song,
    update_custom_song,
)
from .db import ping_database
from .mystery_song_assignments import (
    MysterySongAssignmentUpsertRequest,
    delete_mystery_song_assignment,
    list_mystery_song_assignments,
    upsert_mystery_song_assignment,
)
from .song_location_assignments import (
    SongLocationAssignmentUpsertRequest,
    delete_song_location_assignment,
    delete_song_location_assignments_by_location_ids,
    list_song_location_assignments,
    upsert_song_location_assignment,
)
from .song_location_user_nodes import (
    create_song_location_user_node,
    delete_song_location_user_node,
    list_song_location_user_nodes,
)
from .song_locations import (
    SongLocationNodeCreateRequest,
    SongLocationNodeReorderRequest,
    SongLocationNodeUpdateRequest,
    create_song_location_node,
    delete_song_location_node,
    hard_delete_song_location_node,
    list_song_location_tree,
    reorder_song_location_nodes,
    restore_song_location_node,
    update_song_location_node,
)
from .song_favorites import (
    SongFavoriteCreateRequest,
    SongFavoriteReorderRequest,
    delete_song_favorite,
    list_song_favorites,
    reorder_song_favorites,
    save_song_favorite,
    set_song_favorite_usage_by_id,
)
from .songs import (
    SongFetchRequest,
    SongKeyDetectRequest,
    SongLyricsFetchRequest,
    SongSearchRequest,
    detect_song_key,
    fetch_lyrics_from_chords,
    fetch_song_from_url,
    search_song_portals,
)

app = FastAPI(
    title='Portal Schoenstatt API',
    version='0.1.0',
    description='Backend do portal com busca de musicas e persistencia local (JSON) ou PostgreSQL.',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

assets_dir = PROJECT_DIR / 'assets'
if assets_dir.exists():
    app.mount('/assets', StaticFiles(directory=assets_dir), name='assets')

ROOT_PUBLIC_FILES = {
    'favicon.ico',
    'robots.txt',
}
PORTAL_CONTENT_FILE = PROJECT_DIR / 'assets' / 'data' / 'portal-content.json'


class AdminLoginRequest(BaseModel):
    password: str = ''


def _extract_bearer_token(authorization_header: str | None) -> str:
    raw_header = str(authorization_header or '').strip()
    if not raw_header:
        raise HTTPException(status_code=401, detail={'message': 'Autenticacao obrigatoria.'})

    scheme, _, token = raw_header.partition(' ')
    if scheme.lower() != 'bearer' or not token.strip():
        raise HTTPException(status_code=401, detail={'message': 'Token de autenticacao invalido.'})

    return token.strip()


def _resolve_user_store_namespace_from_auth_header(authorization_header: str | None) -> str:
    token = _extract_bearer_token(authorization_header)
    try:
        user_payload = get_authenticated_user(settings.database_url, token)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={'message': str(exc)}) from exc

    store_namespace = ' '.join(str(user_payload.get('guid') or '').split()).strip()
    if not store_namespace:
        raise HTTPException(status_code=401, detail={'message': 'Sessao invalida.'})
    return store_namespace


def _assert_admin_password(password: str | None) -> None:
    expected_password = str(settings.song_location_delete_password or '')
    provided_password = str(password or '')
    if not expected_password or not compare_digest(provided_password, expected_password):
        raise HTTPException(
            status_code=403,
            detail={
                'message': 'Senha administrativa invalida.',
            },
        )


def _normalize_song_url_key(value: str | None) -> str:
    return ' '.join((value or '').split()).strip().lower()


def _normalize_song_match_token(value: str | None) -> str:
    normalized = unicodedata.normalize('NFD', str(value or ''))
    without_accents = ''.join(char for char in normalized if unicodedata.category(char) != 'Mn')
    return ' '.join(without_accents.lower().split()).strip()


def _normalize_song_title_artist_key(title: str | None, artist: str | None = None) -> str:
    normalized_title = _normalize_song_match_token(title)
    if not normalized_title:
        return ''
    normalized_artist = _normalize_song_match_token(artist)
    return f'{normalized_title}|{normalized_artist}' if normalized_artist else normalized_title


def _build_song_identity(
    song_url: str | None,
    song_title: str | None,
    song_artist: str | None = None,
) -> dict[str, str]:
    return {
        'url_key': _normalize_song_url_key(song_url),
        'title_artist_key': _normalize_song_title_artist_key(song_title, song_artist),
        'title_key': _normalize_song_match_token(song_title),
    }


def _is_song_identity_match(left_identity: dict[str, str], right_identity: dict[str, str]) -> bool:
    left_url = str(left_identity.get('url_key') or '')
    right_url = str(right_identity.get('url_key') or '')
    if left_url and right_url and left_url == right_url:
        return True

    left_title_artist = str(left_identity.get('title_artist_key') or '')
    right_title_artist = str(right_identity.get('title_artist_key') or '')
    if left_title_artist and right_title_artist and left_title_artist == right_title_artist:
        return True

    left_title = str(left_identity.get('title_key') or '')
    right_title = str(right_identity.get('title_key') or '')
    return bool(left_title and right_title and left_title == right_title)


def _normalize_spaces(value: str | None) -> str:
    return ' '.join((value or '').split()).strip()


def _coerce_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_bool(value: object, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = _normalize_spaces(value).lower()
        if not normalized:
            return default
        if normalized in {'0', 'false', 'no', 'nao', 'off', 'inativo', 'inactive'}:
            return False
        if normalized in {'1', 'true', 'yes', 'sim', 'on', 'ativo', 'active'}:
            return True
    return default


def _normalize_song_location_node_row(raw_node: object) -> dict[str, object] | None:
    if not isinstance(raw_node, dict):
        return None
    node_id = _normalize_spaces(str(raw_node.get('node_id') or raw_node.get('nodeId') or raw_node.get('id') or ''))
    label = _normalize_spaces(str(raw_node.get('label') or ''))
    if not node_id or not label:
        return None

    assignment_mode = _normalize_spaces(
        str(raw_node.get('assignment_mode') or raw_node.get('assignmentMode') or 'location')
    ).lower()
    if assignment_mode != 'mystery':
        assignment_mode = 'location'

    mystery_group_title = _normalize_spaces(
        str(raw_node.get('mystery_group_title') or raw_node.get('mysteryGroupTitle') or '')
    )
    mystery_title = _normalize_spaces(str(raw_node.get('mystery_title') or raw_node.get('mysteryTitle') or ''))
    if assignment_mode != 'mystery':
        mystery_group_title = ''
        mystery_title = ''

    return {
        'node_id': node_id,
        'parent_id': _normalize_spaces(str(raw_node.get('parent_id') or raw_node.get('parentId') or '')),
        'label': label,
        'order_index': max(_coerce_int(raw_node.get('order_index') or raw_node.get('orderIndex'), 0), 1),
        'assignment_mode': assignment_mode,
        'mystery_group_title': mystery_group_title,
        'mystery_title': mystery_title,
        'is_active': _coerce_bool(
            raw_node.get('is_active') if 'is_active' in raw_node else raw_node.get('isActive'),
            default=True,
        ),
        'deleted_at_utc': str(raw_node.get('deleted_at_utc') or raw_node.get('deletedAtUtc') or ''),
        'created_at_utc': str(raw_node.get('created_at_utc') or raw_node.get('createdAtUtc') or ''),
        'updated_at_utc': str(raw_node.get('updated_at_utc') or raw_node.get('updatedAtUtc') or ''),
    }


def _song_location_row_to_payload(row: dict[str, object]) -> dict[str, object]:
    return {
        'node_id': row.get('node_id') or '',
        'parent_id': row.get('parent_id') or '',
        'label': row.get('label') or '',
        'order_index': _coerce_int(row.get('order_index'), 0),
        'assignment_mode': row.get('assignment_mode') or 'location',
        'mystery_group_title': row.get('mystery_group_title') or '',
        'mystery_title': row.get('mystery_title') or '',
        'is_active': _coerce_bool(row.get('is_active'), default=True),
        'deleted_at_utc': row.get('deleted_at_utc') or None,
        'created_at_utc': row.get('created_at_utc') or None,
        'updated_at_utc': row.get('updated_at_utc') or None,
    }


def _sort_song_location_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    sorted_rows = [
        _normalize_song_location_node_row(item)
        for item in rows
    ]
    safe_rows = [
        row
        for row in sorted_rows
        if isinstance(row, dict) and row.get('node_id') and row.get('label')
    ]
    safe_rows.sort(
        key=lambda row: (
            str(row.get('parent_id') or ''),
            _coerce_int(row.get('order_index'), 0),
            str(row.get('label') or ''),
            str(row.get('node_id') or ''),
        )
    )
    return safe_rows


def _build_song_location_tree_payload(rows: list[dict[str, object]], include_inactive: bool = False) -> dict[str, object]:
    sorted_rows = _sort_song_location_rows(rows)
    visible_rows = sorted_rows if include_inactive else [
        row
        for row in sorted_rows
        if _coerce_bool(row.get('is_active'), default=True)
    ]

    nodes_by_id = {str(row.get('node_id') or ''): _song_location_row_to_payload(row) for row in visible_rows}
    children_map: dict[str, list[str]] = {}
    root_ids: list[str] = []
    for row in visible_rows:
        node_id = str(row.get('node_id') or '')
        parent_id = str(row.get('parent_id') or '')
        if not node_id:
            continue
        if parent_id and parent_id in nodes_by_id:
            children_map.setdefault(parent_id, []).append(node_id)
        else:
            root_ids.append(node_id)

    def build_node(node_id: str) -> dict[str, object]:
        payload = dict(nodes_by_id.get(node_id) or {})
        child_ids = children_map.get(node_id, [])
        children = [build_node(child_id) for child_id in child_ids]
        payload['children'] = children
        payload['has_children'] = bool(children)
        return payload

    return {
        'count': len(visible_rows),
        'nodes': [_song_location_row_to_payload(row) for row in visible_rows],
        'tree': [build_node(node_id) for node_id in root_ids],
    }


def _merge_song_location_payloads(
    base_payload: dict[str, object],
    user_rows_payload: list[dict[str, object]],
    *,
    include_inactive: bool = False,
) -> dict[str, object]:
    merged_by_id: dict[str, dict[str, object]] = {}
    base_nodes = base_payload.get('nodes')
    if isinstance(base_nodes, list):
        for raw_node in base_nodes:
            normalized = _normalize_song_location_node_row(raw_node)
            if not normalized:
                continue
            merged_by_id[str(normalized.get('node_id') or '')] = normalized

    for raw_node in user_rows_payload:
        normalized = _normalize_song_location_node_row(raw_node)
        if not normalized:
            continue
        merged_by_id[str(normalized.get('node_id') or '')] = normalized

    return _build_song_location_tree_payload(
        list(merged_by_id.values()),
        include_inactive=include_inactive,
    )


def _resolve_song_usage_labels(
    favorite_payload: dict[str, object],
    mystery_assignments: list[dict[str, object]],
    location_assignments: list[dict[str, object]],
) -> list[str]:
    favorite_identity = _build_song_identity(
        str(favorite_payload.get('url') or favorite_payload.get('song_url') or ''),
        str(favorite_payload.get('title') or favorite_payload.get('song_title') or ''),
        str(favorite_payload.get('artist') or favorite_payload.get('song_artist') or ''),
    )

    labels: list[str] = []
    seen_labels: set[str] = set()

    def add_label(value: str) -> None:
        label = ' '.join(str(value or '').split()).strip()
        if not label:
            return
        label_key = _normalize_song_match_token(label)
        if not label_key or label_key in seen_labels:
            return
        seen_labels.add(label_key)
        labels.append(label)

    for assignment in mystery_assignments:
        assignment_identity = _build_song_identity(
            str(assignment.get('song_url') or assignment.get('songUrl') or ''),
            str(assignment.get('song_title') or assignment.get('songTitle') or ''),
            str(assignment.get('song_artist') or assignment.get('songArtist') or ''),
        )
        if not _is_song_identity_match(favorite_identity, assignment_identity):
            continue

        group_title = ' '.join(str(assignment.get('group_title') or assignment.get('groupTitle') or '').split()).strip()
        mystery_title = ' '.join(
            str(assignment.get('mystery_title') or assignment.get('mysteryTitle') or '').split()
        ).strip()
        if not group_title and not mystery_title:
            continue
        add_label(f'{group_title} > {mystery_title}' if group_title and mystery_title else (group_title or mystery_title))

    for assignment in location_assignments:
        assignment_identity = _build_song_identity(
            str(assignment.get('song_url') or assignment.get('songUrl') or ''),
            str(assignment.get('song_title') or assignment.get('songTitle') or ''),
            str(assignment.get('song_artist') or assignment.get('songArtist') or ''),
        )
        if not _is_song_identity_match(favorite_identity, assignment_identity):
            continue

        raw_path = assignment.get('location_path') or assignment.get('locationPath')
        path = [
            ' '.join(str(item or '').split()).strip()
            for item in raw_path
            if isinstance(raw_path, list) and ' '.join(str(item or '').split()).strip()
        ] if isinstance(raw_path, list) else []
        location_label = ' '.join(str(assignment.get('location_label') or assignment.get('locationLabel') or '').split()).strip()
        add_label(' > '.join(path) if path else location_label)

    labels.sort(key=lambda value: value.casefold())
    return labels


@app.get('/api/health')
def api_health() -> dict[str, object]:
    return {
        'status': 'ok',
        'service': 'portal-schoenstatt-api',
        'database_configured': bool(settings.database_url),
        'songs_storage_backend': 'postgresql' if settings.database_url else 'json',
        'song_key_api_configured': bool(settings.spotify_client_id and settings.spotify_client_secret),
        'song_favorites_store': str(settings.song_favorites_file),
        'custom_songs_store': str(settings.custom_songs_file),
        'mystery_song_assignments_store': str(settings.mystery_song_assignments_file),
        'song_locations_store': str(settings.song_locations_file),
        'song_location_user_nodes_store': str(settings.song_location_user_nodes_file),
        'song_location_assignments_store': str(settings.song_location_assignments_file),
    }


@app.get('/api/db/ping')
def api_db_ping() -> dict[str, object]:
    result = ping_database(settings.database_url)
    if not result.get('ok'):
        raise HTTPException(status_code=503, detail=result)
    return result


@app.get('/api/songs/status')
def api_songs_status() -> dict[str, object]:
    return {
        'status': 'prepared',
        'message': (
            'Persistencia pronta. '
            'Com DATABASE_URL definido, favoritos/musicas manuais/vinculos sao salvos no PostgreSQL.'
        ),
    }


@app.get('/api/songs/favorites')
def api_song_favorites_list(authorization: str = Header('', alias='Authorization')) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        favorites = list_song_favorites(
            settings.song_favorites_file,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
        mystery_assignments = list_mystery_song_assignments(
            settings.mystery_song_assignments_file,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
        location_assignments = list_song_location_assignments(
            settings.song_location_assignments_file,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )

        synced_favorites: list[dict[str, object]] = []
        for favorite in favorites:
            safe_favorite = favorite if isinstance(favorite, dict) else {}
            favorite_id = int(safe_favorite.get('id') or 0)
            usage_locations = _resolve_song_usage_labels(
                safe_favorite,
                mystery_assignments,
                location_assignments,
            )
            current_usage_locations = [
                ' '.join(str(item or '').split()).strip()
                for item in safe_favorite.get('usage_locations')
                if isinstance(safe_favorite.get('usage_locations'), list)
                and ' '.join(str(item or '').split()).strip()
            ] if isinstance(safe_favorite.get('usage_locations'), list) else []
            current_usage_locations.sort(key=lambda value: value.casefold())

            if favorite_id > 0 and current_usage_locations != usage_locations:
                updated_favorite = set_song_favorite_usage_by_id(
                    settings.song_favorites_file,
                    favorite_id,
                    usage_locations,
                    database_url=settings.database_url,
                    store_namespace=store_namespace,
                )
                if isinstance(updated_favorite, dict):
                    synced_favorites.append(updated_favorite)
                    continue

            merged_favorite = dict(safe_favorite)
            merged_favorite['usage_locations'] = usage_locations
            synced_favorites.append(merged_favorite)
        favorites = synced_favorites
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'count': len(favorites),
        'favorites': favorites,
    }


@app.post('/api/songs/favorites')
def api_song_favorites_save(
    payload: SongFavoriteCreateRequest,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        favorite = save_song_favorite(
            settings.song_favorites_file,
            payload,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'favorite': favorite,
    }


@app.delete('/api/songs/favorites')
def api_song_favorites_delete(
    url: str = Query(..., min_length=1),
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        removed = delete_song_favorite(
            settings.song_favorites_file,
            url,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'removed': removed,
    }


@app.put('/api/songs/favorites/order')
def api_song_favorites_reorder(
    payload: SongFavoriteReorderRequest,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        favorites = reorder_song_favorites(
            settings.song_favorites_file,
            payload.ordered_ids,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'count': len(favorites),
        'favorites': favorites,
    }


@app.get('/api/mysteries/song-assignments')
def api_mystery_song_assignments_list(authorization: str = Header('', alias='Authorization')) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        assignments = list_mystery_song_assignments(
            settings.mystery_song_assignments_file,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'count': len(assignments),
        'assignments': assignments,
    }


@app.post('/api/mysteries/song-assignments')
def api_mystery_song_assignments_upsert(
    payload: MysterySongAssignmentUpsertRequest,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        assignment = upsert_mystery_song_assignment(
            settings.mystery_song_assignments_file,
            payload,
            favorites_file=settings.song_favorites_file,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'assignment': assignment,
    }


@app.delete('/api/mysteries/song-assignments')
def api_mystery_song_assignments_delete(
    group_title: str = Query(..., min_length=1),
    mystery_title: str = Query(..., min_length=1),
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        removed = delete_mystery_song_assignment(
            settings.mystery_song_assignments_file,
            group_title,
            mystery_title,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'removed': removed,
    }


@app.get('/api/song-locations')
def api_song_locations_list(
    include_inactive: bool = Query(False),
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = ''
    if _normalize_spaces(authorization):
        store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        base_payload = list_song_location_tree(
            settings.song_locations_file,
            portal_content_file=PORTAL_CONTENT_FILE,
            include_inactive=include_inactive,
        )
        if store_namespace:
            user_nodes = list_song_location_user_nodes(
                settings.song_location_user_nodes_file,
                include_inactive=include_inactive,
                database_url=settings.database_url,
                store_namespace=store_namespace,
            )
            payload = _merge_song_location_payloads(
                base_payload,
                user_nodes,
                include_inactive=include_inactive,
            )
        else:
            payload = base_payload
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **payload,
    }


@app.post('/api/song-locations/nodes')
def api_song_locations_create_node(
    payload: SongLocationNodeCreateRequest,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        global_payload = list_song_location_tree(
            settings.song_locations_file,
            portal_content_file=PORTAL_CONTENT_FILE,
            include_inactive=True,
        )
        user_nodes = list_song_location_user_nodes(
            settings.song_location_user_nodes_file,
            include_inactive=True,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
        merged_payload = _merge_song_location_payloads(
            global_payload,
            user_nodes,
            include_inactive=True,
        )
        valid_parent_ids = {
            _normalize_spaces(str(row.get('node_id') or row.get('nodeId') or row.get('id') or ''))
            for row in (merged_payload.get('nodes') if isinstance(merged_payload.get('nodes'), list) else [])
            if isinstance(row, dict)
            and _normalize_spaces(str(row.get('node_id') or row.get('nodeId') or row.get('id') or ''))
            and _coerce_bool(
                row.get('is_active') if 'is_active' in row else row.get('isActive'),
                default=True,
            )
        }

        node = create_song_location_user_node(
            settings.song_location_user_nodes_file,
            payload,
            valid_parent_ids=valid_parent_ids,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'node': node,
    }


@app.delete('/api/song-locations/user-nodes/{node_id}')
def api_song_locations_delete_user_node(
    node_id: str,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        delete_payload = delete_song_location_user_node(
            settings.song_location_user_nodes_file,
            node_id,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
        removed_ids = delete_payload.get('removed_node_ids')
        removed_node_ids = [
            _normalize_spaces(str(raw_id))
            for raw_id in (removed_ids if isinstance(removed_ids, list) else [])
            if _normalize_spaces(str(raw_id))
        ]
        assignment_cleanup = delete_song_location_assignments_by_location_ids(
            settings.song_location_assignments_file,
            removed_node_ids,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if message == 'Categoria/subcategoria nao encontrada.' else 400
        raise HTTPException(status_code=status_code, detail={'message': message}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **delete_payload,
        'assignment_cleanup': assignment_cleanup,
    }


@app.put('/api/song-locations/nodes/{node_id}')
def api_song_locations_update_node(node_id: str, payload: SongLocationNodeUpdateRequest) -> dict[str, object]:
    try:
        node = update_song_location_node(
            settings.song_locations_file,
            node_id,
            payload,
            portal_content_file=PORTAL_CONTENT_FILE,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if message == 'Categoria/subcategoria nao encontrada.' else 400
        raise HTTPException(status_code=status_code, detail={'message': message}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'node': node,
    }


@app.delete('/api/song-locations/nodes/{node_id}')
def api_song_locations_delete_node(
    node_id: str,
    location_delete_password: str = Header('', alias='X-Location-Delete-Password'),
) -> dict[str, object]:
    expected_password = str(settings.song_location_delete_password or '')
    provided_password = str(location_delete_password or '')
    if not expected_password or not compare_digest(provided_password, expected_password):
        raise HTTPException(
            status_code=403,
            detail={
                'message': 'Senha invalida para inativar o item.',
            },
        )
    try:
        payload = delete_song_location_node(
            settings.song_locations_file,
            node_id,
            portal_content_file=PORTAL_CONTENT_FILE,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if message == 'Categoria/subcategoria nao encontrada.' else 400
        raise HTTPException(status_code=status_code, detail={'message': message}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **payload,
    }


@app.put('/api/song-locations/nodes/{node_id}/restore')
def api_song_locations_restore_node(node_id: str) -> dict[str, object]:
    try:
        payload = restore_song_location_node(
            settings.song_locations_file,
            node_id,
            portal_content_file=PORTAL_CONTENT_FILE,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if message == 'Categoria/subcategoria nao encontrada.' else 400
        raise HTTPException(status_code=status_code, detail={'message': message}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **payload,
    }


@app.put('/api/song-locations/reorder')
def api_song_locations_reorder_nodes(payload: SongLocationNodeReorderRequest) -> dict[str, object]:
    try:
        siblings = reorder_song_location_nodes(
            settings.song_locations_file,
            payload,
            portal_content_file=PORTAL_CONTENT_FILE,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'count': len(siblings),
        'siblings': siblings,
    }


@app.get('/api/song-locations/assignments')
def api_song_location_assignments_list(authorization: str = Header('', alias='Authorization')) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        assignments = list_song_location_assignments(
            settings.song_location_assignments_file,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'count': len(assignments),
        'assignments': assignments,
    }


@app.post('/api/song-locations/assignments')
def api_song_location_assignments_upsert(
    payload: SongLocationAssignmentUpsertRequest,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        assignment = upsert_song_location_assignment(
            settings.song_location_assignments_file,
            payload,
            favorites_file=settings.song_favorites_file,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'assignment': assignment,
    }


@app.delete('/api/song-locations/assignments')
def api_song_location_assignments_delete(
    location_id: str = Query(..., min_length=1),
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        removed = delete_song_location_assignment(
            settings.song_location_assignments_file,
            location_id,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'removed': removed,
    }


@app.post('/api/admin/login')
def api_admin_login(payload: AdminLoginRequest) -> dict[str, object]:
    _assert_admin_password(payload.password)
    return {
        'ok': True,
    }


@app.post('/api/auth/register')
def api_auth_register(payload: AuthRegisterRequest, request: Request) -> dict[str, object]:
    try:
        auth_payload = register_user(
            settings.database_url,
            payload,
            session_days=settings.auth_session_days,
            user_agent=request.headers.get('user-agent', ''),
            forwarded_for=request.headers.get('x-forwarded-for', ''),
            client_ip=request.client.host if request.client else '',
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **auth_payload,
    }


@app.post('/api/auth/login')
def api_auth_login(payload: AuthLoginRequest, request: Request) -> dict[str, object]:
    try:
        auth_payload = login_user(
            settings.database_url,
            payload,
            session_days=settings.auth_session_days,
            user_agent=request.headers.get('user-agent', ''),
            forwarded_for=request.headers.get('x-forwarded-for', ''),
            client_ip=request.client.host if request.client else '',
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **auth_payload,
    }


@app.get('/api/auth/me')
def api_auth_me(authorization: str = Header('', alias='Authorization')) -> dict[str, object]:
    token = _extract_bearer_token(authorization)

    try:
        user_payload = get_authenticated_user(settings.database_url, token)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'user': user_payload,
    }


@app.put('/api/auth/me')
def api_auth_me_update(
    payload: AuthAccountUpdateRequest,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    token = _extract_bearer_token(authorization)

    try:
        user_payload = update_authenticated_user(settings.database_url, token, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'user': user_payload,
    }


@app.delete('/api/auth/me')
def api_auth_me_delete(authorization: str = Header('', alias='Authorization')) -> dict[str, object]:
    token = _extract_bearer_token(authorization)

    try:
        deleted = delete_authenticated_user(settings.database_url, token)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'deleted': deleted,
    }


@app.post('/api/auth/logout')
def api_auth_logout(authorization: str = Header('', alias='Authorization')) -> dict[str, object]:
    token = _extract_bearer_token(authorization)

    try:
        logged_out = logout_user(settings.database_url, token)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'logged_out': logged_out,
    }


@app.get('/api/admin/song-locations')
def api_admin_song_locations_list(
    include_inactive: bool = Query(False),
    admin_password: str = Header('', alias='X-Admin-Password'),
) -> dict[str, object]:
    _assert_admin_password(admin_password)
    try:
        payload = list_song_location_tree(
            settings.song_locations_file,
            portal_content_file=PORTAL_CONTENT_FILE,
            include_inactive=include_inactive,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **payload,
    }


@app.post('/api/admin/song-locations/nodes')
def api_admin_song_locations_create_node(
    payload: SongLocationNodeCreateRequest,
    admin_password: str = Header('', alias='X-Admin-Password'),
) -> dict[str, object]:
    _assert_admin_password(admin_password)
    try:
        node = create_song_location_node(
            settings.song_locations_file,
            payload,
            portal_content_file=PORTAL_CONTENT_FILE,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'node': node,
    }


@app.delete('/api/admin/song-locations/nodes/{node_id}')
def api_admin_song_locations_delete_node(
    node_id: str,
    admin_password: str = Header('', alias='X-Admin-Password'),
) -> dict[str, object]:
    _assert_admin_password(admin_password)
    try:
        payload = hard_delete_song_location_node(
            settings.song_locations_file,
            node_id,
            portal_content_file=PORTAL_CONTENT_FILE,
        )
        assignment_cleanup = delete_song_location_assignments_by_location_ids(
            settings.song_location_assignments_file,
            payload.get('removed_ids') if isinstance(payload.get('removed_ids'), list) else [],
            database_url=settings.database_url,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if message == 'Categoria/subcategoria nao encontrada.' else 400
        raise HTTPException(status_code=status_code, detail={'message': message}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **payload,
        'assignment_cleanup': assignment_cleanup,
    }


@app.get('/api/songs/custom')
def api_custom_songs_list(
    include_inactive: bool = Query(False),
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        songs = list_custom_songs(
            settings.custom_songs_file,
            include_inactive=include_inactive,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'count': len(songs),
        'songs': songs,
    }


@app.post('/api/songs/custom')
def api_custom_songs_create(
    payload: CustomSongUpsertRequest,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        song = create_custom_song(
            settings.custom_songs_file,
            payload,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'song': song,
    }


@app.put('/api/songs/custom/order')
def api_custom_songs_reorder(
    payload: CustomSongReorderRequest,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        songs = reorder_custom_songs(
            settings.custom_songs_file,
            payload.ordered_ids,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'count': len(songs),
        'songs': songs,
    }


@app.put('/api/songs/custom/{song_id}')
def api_custom_songs_update(
    song_id: int,
    payload: CustomSongUpsertRequest,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        song = update_custom_song(
            settings.custom_songs_file,
            song_id,
            payload,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if message == 'Musica manual nao encontrada.' else 400
        raise HTTPException(status_code=status_code, detail={'message': message}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'song': song,
    }


@app.delete('/api/songs/custom/{song_id}')
def api_custom_songs_delete(song_id: int, authorization: str = Header('', alias='Authorization')) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        removed = delete_custom_song(
            settings.custom_songs_file,
            song_id,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if message == 'Musica manual nao encontrada.' else 400
        raise HTTPException(status_code=status_code, detail={'message': message}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'removed': removed,
    }


@app.put('/api/songs/custom/{song_id}/restore')
def api_custom_songs_restore(song_id: int, authorization: str = Header('', alias='Authorization')) -> dict[str, object]:
    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        song = restore_custom_song(
            settings.custom_songs_file,
            song_id,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if message == 'Musica manual nao encontrada.' else 400
        raise HTTPException(status_code=status_code, detail={'message': message}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'song': song,
    }


@app.post('/api/songs/fetch')
def api_song_fetch(payload: SongFetchRequest) -> dict[str, object]:
    try:
        song = fetch_song_from_url(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **song,
    }


@app.post('/api/songs/detect-key')
def api_song_detect_key(payload: SongKeyDetectRequest) -> dict[str, object]:
    try:
        result = detect_song_key(payload.title, payload.artist)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **result,
    }


@app.post('/api/songs/search')
def api_song_search(payload: SongSearchRequest) -> dict[str, object]:
    try:
        normalized_page_size = payload.page_size if payload.page_size is not None else payload.limit
        search_payload = search_song_portals(
            payload.query,
            page=payload.page,
            page_size=normalized_page_size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail={'message': str(exc)}) from exc

    results = search_payload.get('results', [])
    if not isinstance(results, list):
        results = []

    return {
        'ok': True,
        'query': payload.query.strip(),
        'count': len(results),
        'page': search_payload.get('page', 1),
        'page_size': search_payload.get('page_size', normalized_page_size),
        'total': search_payload.get('total', len(results)),
        'has_more': bool(search_payload.get('has_more')),
        'results': results,
    }


@app.post('/api/songs/fetch-lyrics')
def api_song_fetch_lyrics(payload: SongLyricsFetchRequest) -> dict[str, object]:
    try:
        song = fetch_lyrics_from_chords(payload.title, payload.artist, payload.source_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        message = str(exc)
        if message == 'Nao foi possivel gerar letra a partir da cifra.':
            raise HTTPException(status_code=404, detail={'message': message, 'code': 'lyrics_not_found'}) from exc
        raise HTTPException(status_code=502, detail={'message': message}) from exc

    return {
        'ok': True,
        **song,
    }


@app.get('/', include_in_schema=False)
def site_index() -> FileResponse:
    return FileResponse(PROJECT_DIR / 'index.html')


@app.get('/site.webmanifest', include_in_schema=False)
def site_manifest() -> FileResponse:
    manifest_path = PROJECT_DIR / 'site.webmanifest'
    if manifest_path.exists():
        return FileResponse(manifest_path)
    raise HTTPException(status_code=404, detail='Manifest nao encontrado')


@app.get('/admin/song-locations', include_in_schema=False)
def admin_song_locations_page() -> FileResponse:
    page_path = PROJECT_DIR / 'admin-song-locations.html'
    if page_path.exists():
        return FileResponse(page_path)
    raise HTTPException(status_code=404, detail='Pagina administrativa nao encontrada')


@app.get('/admin', include_in_schema=False)
@app.get('/admin/', include_in_schema=False)
def admin_page() -> FileResponse:
    page_path = PROJECT_DIR / 'admin-song-locations.html'
    if page_path.exists():
        return FileResponse(page_path)
    raise HTTPException(status_code=404, detail='Pagina administrativa nao encontrada')


@app.get('/{file_name}', include_in_schema=False)
def top_level_files(file_name: str) -> FileResponse:
    safe_name = Path(file_name).name
    if safe_name not in ROOT_PUBLIC_FILES:
        raise HTTPException(status_code=404, detail='Arquivo nao encontrado')

    file_path = PROJECT_DIR / safe_name

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail='Arquivo nao encontrado')

    return FileResponse(file_path)
