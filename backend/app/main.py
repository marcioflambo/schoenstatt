from __future__ import annotations

import base64
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from hmac import compare_digest
from io import BytesIO
from pathlib import Path
import secrets
import re
import time
from threading import Lock
import unicodedata
from urllib.parse import urlencode

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import qrcode
from qrcode.image.svg import SvgPathImage

from .auth import (
    AuthAccountUpdateRequest,
    AuthLoginRequest,
    AuthQrApproveRequest,
    AuthQrCompleteRequest,
    AuthRegisterRequest,
    approve_qr_login_session,
    complete_qr_login_session,
    create_qr_login_session,
    delete_authenticated_user,
    get_authenticated_user,
    get_qr_login_session_status,
    list_authenticated_user_sessions,
    login_user,
    logout_authenticated_user_session,
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
from .json_store_db import load_store, save_store
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
    description='Backend do portal com busca de músicas e persistência local (JSON) ou PostgreSQL.',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allow_headers=['Authorization', 'Content-Type', 'X-Location-Delete-Password'],
    max_age=600,
)

assets_dir = PROJECT_DIR / 'assets'
if assets_dir.exists():
    app.mount('/assets', StaticFiles(directory=assets_dir), name='assets')

ROOT_PUBLIC_FILES = {
    'favicon.ico',
    'robots.txt',
}
PORTAL_CONTENT_FILE = PROJECT_DIR / 'assets' / 'data' / 'portal-content.json'
SONG_SHARE_QUERY_KEY = 'song_share'
SONG_SHARE_STORE_PREFIX = 'song_share_snapshot'
SONG_SHARE_MAX_LIST_ITEMS = 1500
RATE_LIMIT_BUCKET_API_GLOBAL = 'api-global'
RATE_LIMIT_BUCKET_API_WRITE = 'api-write'
RATE_LIMIT_BUCKET_AUTH = 'auth'
RATE_LIMIT_BUCKET_SHARE = 'share'
_RATE_LIMIT_STATE: dict[str, deque[float]] = defaultdict(deque)
_RATE_LIMIT_LOCK = Lock()


class SongShareImportRequest(BaseModel):
    share_id: str
    exclude_conflict_keys: list[str] = []


def _extract_bearer_token(authorization_header: str | None) -> str:
    raw_header = str(authorization_header or '').strip()
    if not raw_header:
        raise HTTPException(status_code=401, detail={'message': 'Autenticação obrigatória.'})

    scheme, _, token = raw_header.partition(' ')
    if scheme.lower() != 'bearer' or not token.strip():
        raise HTTPException(status_code=401, detail={'message': 'Token de autenticação inválido.'})

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
        raise HTTPException(status_code=401, detail={'message': 'Sessão inválida.'})
    return store_namespace


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


def _resolve_client_ip(request: Request) -> str:
    forwarded_for = _normalize_spaces(request.headers.get('x-forwarded-for', ''))
    if forwarded_for:
        first_client = _normalize_spaces(forwarded_for.split(',')[0])
        if first_client:
            return first_client
    if request.client and request.client.host:
        return _normalize_spaces(str(request.client.host))
    return 'unknown'


def _enforce_rate_limit(
    request: Request,
    *,
    bucket: str,
    max_requests: int,
    window_seconds: int,
) -> None:
    if max_requests <= 0 or window_seconds <= 0:
        return

    client_ip = _resolve_client_ip(request)
    safe_bucket = _normalize_spaces(bucket) or 'default'
    request_key = f'{safe_bucket}|{client_ip}'
    now = time.monotonic()
    window_start = now - window_seconds

    with _RATE_LIMIT_LOCK:
        request_times = _RATE_LIMIT_STATE[request_key]
        while request_times and request_times[0] <= window_start:
            request_times.popleft()

        if len(request_times) >= max_requests:
            retry_after = max(1, int((request_times[0] + window_seconds) - now) + 1)
            raise HTTPException(
                status_code=429,
                detail={'message': 'Limite de requisições excedido. Aguarde alguns instantes.'},
                headers={'Retry-After': str(retry_after)},
            )

        request_times.append(now)


def _enforce_auth_rate_limit(request: Request) -> None:
    _enforce_rate_limit(
        request,
        bucket=RATE_LIMIT_BUCKET_AUTH,
        max_requests=settings.rate_limit_auth_requests,
        window_seconds=settings.rate_limit_window_seconds,
    )


def _enforce_share_rate_limit(request: Request) -> None:
    _enforce_rate_limit(
        request,
        bucket=RATE_LIMIT_BUCKET_SHARE,
        max_requests=settings.rate_limit_share_requests,
        window_seconds=settings.rate_limit_window_seconds,
    )


@app.middleware('http')
async def api_rate_limit_middleware(request: Request, call_next):
    safe_path = _normalize_spaces(str(request.url.path or ''))
    safe_method = _normalize_spaces(request.method).upper()
    is_api_path = safe_path.startswith('/api/')
    try:
        if is_api_path and safe_method != 'OPTIONS':
            _enforce_rate_limit(
                request,
                bucket=RATE_LIMIT_BUCKET_API_GLOBAL,
                max_requests=settings.rate_limit_global_requests,
                window_seconds=settings.rate_limit_window_seconds,
            )
            if safe_method in {'POST', 'PUT', 'DELETE', 'PATCH'}:
                _enforce_rate_limit(
                    request,
                    bucket=RATE_LIMIT_BUCKET_API_WRITE,
                    max_requests=settings.rate_limit_write_requests,
                    window_seconds=settings.rate_limit_window_seconds,
                )
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={'detail': exc.detail},
            headers=exc.headers or {},
        )

    return await call_next(request)


def _resolve_public_base_url(request: Request) -> str:
    configured_base_url = _normalize_spaces(settings.public_base_url)
    if configured_base_url:
        return configured_base_url.rstrip('/')

    base_url = _normalize_spaces(str(request.base_url or ''))
    safe_base_url = base_url.rstrip('/') if base_url else ''
    if safe_base_url:
        return safe_base_url

    forwarded_proto = _normalize_spaces(request.headers.get('x-forwarded-proto', ''))
    forwarded_host = _normalize_spaces(request.headers.get('x-forwarded-host', ''))
    host = (forwarded_host.split(',')[0] if forwarded_host else _normalize_spaces(request.headers.get('host', ''))).strip()
    scheme = (forwarded_proto.split(',')[0] if forwarded_proto else _normalize_spaces(request.url.scheme)).strip() or 'https'
    return f'{scheme}://{host}' if host else ''


def _build_portal_url_with_query(request: Request, query_params: dict[str, str]) -> str:
    safe_query_params = {
        _normalize_spaces(key): _normalize_spaces(value)
        for key, value in query_params.items()
        if _normalize_spaces(key) and _normalize_spaces(value)
    }
    query = urlencode(safe_query_params)
    safe_base_url = _resolve_public_base_url(request)
    return f'{safe_base_url}/?{query}' if safe_base_url and query else f'/?{query}' if query else '/'


def _build_auth_qr_approve_url(request: Request, session_guid: str, approve_token: str) -> str:
    safe_session_guid = _normalize_spaces(session_guid)
    safe_approve_token = _normalize_spaces(approve_token)
    if not safe_session_guid or not safe_approve_token:
        return ''

    return _build_portal_url_with_query(request, {
        'auth_qr_session': safe_session_guid,
        'auth_qr_token': safe_approve_token,
    })


def _build_auth_qr_svg_data_url(content: str) -> str:
    safe_content = _normalize_spaces(content)
    if not safe_content:
        return ''

    qr_code = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr_code.add_data(safe_content)
    qr_code.make(fit=True)
    image = qr_code.make_image(image_factory=SvgPathImage)
    buffer = BytesIO()
    image.save(buffer)
    svg_payload = buffer.getvalue()
    if not svg_payload:
        return ''
    encoded = base64.b64encode(svg_payload).decode('ascii')
    return f'data:image/svg+xml;base64,{encoded}'


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


def _build_empty_song_assignment_cleanup_payload() -> dict[str, object]:
    return {
        'mystery': {
            'removed': False,
            'count': 0,
            'removed_assignments': [],
        },
        'location': {
            'removed': False,
            'count': 0,
            'removed_location_ids': [],
        },
    }


def _cleanup_song_assignments_for_identity(
    song_identity: dict[str, str],
    store_namespace: str,
) -> dict[str, object]:
    cleanup_payload = _build_empty_song_assignment_cleanup_payload()
    safe_song_identity = song_identity if isinstance(song_identity, dict) else {}
    if not (
        str(safe_song_identity.get('url_key') or '')
        or str(safe_song_identity.get('title_artist_key') or '')
        or str(safe_song_identity.get('title_key') or '')
    ):
        return cleanup_payload

    mystery_assignments = list_mystery_song_assignments(
        settings.mystery_song_assignments_file,
        database_url=settings.database_url,
        store_namespace=store_namespace,
    )
    removed_mystery_assignments: list[dict[str, str]] = []
    for assignment in mystery_assignments:
        assignment_identity = _build_song_identity(
            str(assignment.get('song_url') or assignment.get('songUrl') or ''),
            str(assignment.get('song_title') or assignment.get('songTitle') or ''),
            str(assignment.get('song_artist') or assignment.get('songArtist') or ''),
        )
        if not _is_song_identity_match(safe_song_identity, assignment_identity):
            continue

        group_title = _normalize_spaces(str(assignment.get('group_title') or assignment.get('groupTitle') or ''))
        mystery_title = _normalize_spaces(str(assignment.get('mystery_title') or assignment.get('mysteryTitle') or ''))
        if not group_title or not mystery_title:
            continue

        removed = delete_mystery_song_assignment(
            settings.mystery_song_assignments_file,
            group_title,
            mystery_title,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
        if removed:
            removed_mystery_assignments.append({
                'group_title': group_title,
                'mystery_title': mystery_title,
            })

    cleanup_payload['mystery'] = {
        'removed': bool(removed_mystery_assignments),
        'count': len(removed_mystery_assignments),
        'removed_assignments': removed_mystery_assignments,
    }

    location_assignments = list_song_location_assignments(
        settings.song_location_assignments_file,
        database_url=settings.database_url,
        store_namespace=store_namespace,
    )
    matched_location_ids: set[str] = set()
    for assignment in location_assignments:
        assignment_identity = _build_song_identity(
            str(assignment.get('song_url') or assignment.get('songUrl') or ''),
            str(assignment.get('song_title') or assignment.get('songTitle') or ''),
            str(assignment.get('song_artist') or assignment.get('songArtist') or ''),
        )
        if not _is_song_identity_match(safe_song_identity, assignment_identity):
            continue

        location_id = _normalize_spaces(str(assignment.get('location_id') or assignment.get('locationId') or ''))
        if location_id:
            matched_location_ids.add(location_id)

    cleanup_payload['location'] = delete_song_location_assignments_by_location_ids(
        settings.song_location_assignments_file,
        sorted(matched_location_ids),
        database_url=settings.database_url,
        store_namespace=store_namespace,
    )
    return cleanup_payload


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _to_utc_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def _parse_utc_timestamp(value: object) -> datetime | None:
    raw_value = _normalize_spaces(str(value or ''))
    if not raw_value:
        return None
    normalized = f"{raw_value[:-1]}+00:00" if raw_value.endswith('Z') else raw_value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _resolve_song_share_expires_at(snapshot_payload: dict[str, object]) -> datetime | None:
    expires_at = _parse_utc_timestamp(snapshot_payload.get('expires_at_utc'))
    if expires_at:
        return expires_at

    created_at = _parse_utc_timestamp(snapshot_payload.get('created_at_utc'))
    if not created_at:
        return None
    return created_at + timedelta(hours=max(1, settings.song_share_ttl_hours))


def _is_song_share_snapshot_expired(snapshot_payload: dict[str, object]) -> bool:
    expires_at = _resolve_song_share_expires_at(snapshot_payload)
    if not expires_at:
        return True
    return expires_at <= _now_utc()


def _normalize_song_share_id(raw_value: str | None) -> str:
    share_id = _normalize_spaces(raw_value)
    if not share_id:
        raise ValueError('Informe o código de compartilhamento.')
    if len(share_id) > 80:
        raise ValueError('Código de compartilhamento inválido.')
    if not re.fullmatch(r'[A-Za-z0-9_-]{8,80}', share_id):
        raise ValueError('Código de compartilhamento inválido.')
    return share_id


def _build_song_share_store_key(share_id: str) -> str:
    return f'{SONG_SHARE_STORE_PREFIX}:{share_id}'


def _generate_song_share_id() -> str:
    return secrets.token_urlsafe(18).rstrip('=')


def _truncate_song_share_rows(rows: object) -> list[dict[str, object]]:
    safe_rows = rows if isinstance(rows, list) else []
    normalized_rows: list[dict[str, object]] = []
    for item in safe_rows:
        if not isinstance(item, dict):
            continue
        normalized_rows.append(dict(item))
        if len(normalized_rows) >= SONG_SHARE_MAX_LIST_ITEMS:
            break
    return normalized_rows


def _build_song_share_counts(snapshot_payload: dict[str, object]) -> dict[str, int]:
    data = snapshot_payload.get('data') if isinstance(snapshot_payload.get('data'), dict) else {}
    return {
        'custom_songs': len(data.get('custom_songs')) if isinstance(data.get('custom_songs'), list) else 0,
        'mystery_song_assignments': (
            len(data.get('mystery_song_assignments')) if isinstance(data.get('mystery_song_assignments'), list) else 0
        ),
        'song_location_assignments': (
            len(data.get('song_location_assignments')) if isinstance(data.get('song_location_assignments'), list) else 0
        ),
        'song_location_user_nodes': (
            len(data.get('song_location_user_nodes')) if isinstance(data.get('song_location_user_nodes'), list) else 0
        ),
        'song_favorites': len(data.get('song_favorites')) if isinstance(data.get('song_favorites'), list) else 0,
    }


def _build_song_share_view_data(snapshot_payload: dict[str, object]) -> dict[str, list[dict[str, object]]]:
    data = snapshot_payload.get('data') if isinstance(snapshot_payload.get('data'), dict) else {}
    return {
        'custom_songs': _truncate_song_share_rows(data.get('custom_songs')),
        'mystery_song_assignments': _truncate_song_share_rows(data.get('mystery_song_assignments')),
        'song_location_assignments': _truncate_song_share_rows(data.get('song_location_assignments')),
        'song_location_user_nodes': _truncate_song_share_rows(data.get('song_location_user_nodes')),
        'song_favorites': _truncate_song_share_rows(data.get('song_favorites')),
    }


def _normalize_song_share_conflict_token(value: str | None) -> str:
    normalized = _normalize_song_match_token(value)
    if not normalized:
        return ''
    return re.sub(r'[^a-z0-9]+', '-', normalized).strip('-')


def _normalize_song_share_conflict_key(value: object) -> str:
    return _normalize_spaces(str(value or '')).lower()


def _normalize_song_share_conflict_keys(values: object) -> set[str]:
    if not isinstance(values, list):
        return set()
    normalized: set[str] = set()
    for raw_value in values:
        key = _normalize_song_share_conflict_key(raw_value)
        if key:
            normalized.add(key)
    return normalized


def _read_song_row_value(raw_row: dict[str, object], *keys: str) -> str:
    for key in keys:
        value = _normalize_spaces(str(raw_row.get(key) or ''))
        if value:
            return value
    return ''


def _read_song_location_path(raw_row: dict[str, object]) -> list[str]:
    raw_path = raw_row.get('location_path')
    if not isinstance(raw_path, list):
        raw_path = raw_row.get('locationPath')
    if not isinstance(raw_path, list):
        return []
    return [
        _normalize_spaces(str(item))
        for item in raw_path
        if _normalize_spaces(str(item))
    ]


def _read_song_identity_from_row(
    raw_row: dict[str, object],
    *,
    title_keys: tuple[str, ...],
    artist_keys: tuple[str, ...],
    url_keys: tuple[str, ...],
) -> tuple[dict[str, str], str, str, str]:
    title = _read_song_row_value(raw_row, *title_keys)
    artist = _read_song_row_value(raw_row, *artist_keys)
    song_url = _read_song_row_value(raw_row, *url_keys)
    identity = _build_song_identity(song_url, title, artist)
    return identity, title, artist, song_url


def _normalize_share_mystery_title(value: str | None) -> str:
    title = _normalize_spaces(value)
    if not title:
        return ''
    return re.sub(r'^\d+\s*[^0-9A-Za-z]?\s*', '', title, flags=re.IGNORECASE).strip()


def _canonical_share_mystery_group_token(value: str | None) -> str:
    group = _normalize_song_match_token(value)
    if not group:
        return ''
    group = re.sub(r'\bmisterios?\b', '', group).strip()
    return _normalize_song_share_conflict_token(group)


def _build_share_mystery_conflict_key(raw_row: dict[str, object]) -> str:
    group_title = _read_song_row_value(raw_row, 'group_title', 'groupTitle')
    mystery_title = _normalize_share_mystery_title(
        _read_song_row_value(raw_row, 'mystery_title', 'mysteryTitle')
    )
    if not group_title or not mystery_title:
        return ''
    group_token = _canonical_share_mystery_group_token(group_title)
    mystery_token = _normalize_song_share_conflict_token(mystery_title)
    if not group_token or not mystery_token:
        return ''
    return f'mystery:{group_token}|{mystery_token}'


def _build_share_location_slot_token(raw_row: dict[str, object]) -> str:
    location_path = _read_song_location_path(raw_row)
    if location_path:
        path_tokens = [
            _normalize_song_share_conflict_token(item)
            for item in location_path
            if _normalize_song_share_conflict_token(item)
        ]
        if path_tokens:
            return f'path:{"|".join(path_tokens)}'

    location_label = _read_song_row_value(raw_row, 'location_label', 'locationLabel')
    if location_label:
        label_token = _normalize_song_share_conflict_token(location_label)
        if label_token:
            return f'label:{label_token}'

    location_id = _read_song_row_value(raw_row, 'location_id', 'locationId')
    if location_id:
        location_id_token = _normalize_song_share_conflict_token(location_id)
        if location_id_token:
            return f'id:{location_id_token}'
    return ''


def _build_share_location_id_lookup_token(raw_row: dict[str, object]) -> str:
    location_id = _read_song_row_value(raw_row, 'location_id', 'locationId')
    if not location_id:
        return ''
    location_id_token = _normalize_song_share_conflict_token(location_id)
    if not location_id_token:
        return ''
    return f'id:{location_id_token}'


def _build_share_location_conflict_key(raw_row: dict[str, object]) -> str:
    slot_token = _build_share_location_slot_token(raw_row)
    if not slot_token:
        return ''
    return f'location:{slot_token}'


def _build_share_favorite_conflict_key(raw_row: dict[str, object]) -> str:
    song_url = _read_song_row_value(raw_row, 'url', 'song_url', 'songUrl')
    song_url_key = _normalize_song_url_key(song_url)
    if song_url_key:
        url_token = _normalize_song_share_conflict_token(song_url_key)
        if url_token:
            return f'favorite:url:{url_token}'

    title = _read_song_row_value(raw_row, 'title', 'song_title', 'songTitle')
    artist = _read_song_row_value(raw_row, 'artist', 'song_artist', 'songArtist')
    title_artist_key = _normalize_song_title_artist_key(title, artist)
    if not title_artist_key:
        return ''
    title_artist_token = _normalize_song_share_conflict_token(title_artist_key)
    if not title_artist_token:
        return ''
    return f'favorite:title:{title_artist_token}'


def _build_song_share_slot_label(raw_row: dict[str, object], item_type: str) -> str:
    if item_type == 'mystery_song_assignments':
        group_title = _read_song_row_value(raw_row, 'group_title', 'groupTitle')
        mystery_title = _normalize_share_mystery_title(
            _read_song_row_value(raw_row, 'mystery_title', 'mysteryTitle')
        )
        if group_title and mystery_title:
            return f'Misterios > {group_title} > {mystery_title}'
        return f'Misterios > {group_title or mystery_title or "Sem local"}'

    if item_type == 'song_location_assignments':
        location_path = _read_song_location_path(raw_row)
        if location_path:
            return f'Terco > {" > ".join(location_path)}'
        location_label = _read_song_row_value(raw_row, 'location_label', 'locationLabel')
        if location_label:
            return f'Terco > {location_label}'
        location_id = _read_song_row_value(raw_row, 'location_id', 'locationId')
        return f'Terco > {location_id or "Sem local"}'

    title = _read_song_row_value(raw_row, 'title', 'song_title', 'songTitle')
    if title:
        return f'Favoritos > {title}'
    song_url = _read_song_row_value(raw_row, 'url', 'song_url', 'songUrl')
    return f'Favoritos > {song_url or "Musica"}'


def _build_song_share_merge_item(
    *,
    key: str,
    item_type: str,
    slot_label: str,
    incoming_title: str,
    incoming_artist: str,
    incoming_url: str,
    existing_title: str = '',
    existing_artist: str = '',
    existing_url: str = '',
) -> dict[str, str]:
    return {
        'key': key,
        'type': item_type,
        'slot_label': slot_label,
        'incoming_song_title': incoming_title,
        'incoming_song_artist': incoming_artist,
        'incoming_song_url': incoming_url,
        'existing_song_title': existing_title,
        'existing_song_artist': existing_artist,
        'existing_song_url': existing_url,
    }


def _build_song_share_merge_plan(
    share_snapshot: dict[str, object],
    target_namespace: str,
) -> dict[str, object]:
    share_data = share_snapshot.get('data') if isinstance(share_snapshot.get('data'), dict) else {}
    custom_rows = _truncate_song_share_rows(share_data.get('custom_songs'))
    mystery_rows = _truncate_song_share_rows(share_data.get('mystery_song_assignments'))
    location_assignment_rows = _truncate_song_share_rows(share_data.get('song_location_assignments'))
    location_user_node_rows = _truncate_song_share_rows(share_data.get('song_location_user_nodes'))
    favorite_rows = _truncate_song_share_rows(share_data.get('song_favorites'))

    existing_favorites = list_song_favorites(
        settings.song_favorites_file,
        database_url=settings.database_url,
        store_namespace=target_namespace,
    )
    existing_mystery_rows = list_mystery_song_assignments(
        settings.mystery_song_assignments_file,
        database_url=settings.database_url,
        store_namespace=target_namespace,
    )
    existing_location_rows = list_song_location_assignments(
        settings.song_location_assignments_file,
        database_url=settings.database_url,
        store_namespace=target_namespace,
    )

    existing_favorites_by_key: dict[str, dict[str, object]] = {}
    for raw_row in existing_favorites:
        if not isinstance(raw_row, dict):
            continue
        key = _build_share_favorite_conflict_key(raw_row)
        if key and key not in existing_favorites_by_key:
            existing_favorites_by_key[key] = raw_row

    existing_mystery_by_key: dict[str, dict[str, object]] = {}
    for raw_row in existing_mystery_rows:
        if not isinstance(raw_row, dict):
            continue
        key = _build_share_mystery_conflict_key(raw_row)
        if key and key not in existing_mystery_by_key:
            existing_mystery_by_key[key] = raw_row

    existing_location_by_slot: dict[str, dict[str, object]] = {}
    existing_location_by_id: dict[str, dict[str, object]] = {}
    for raw_row in existing_location_rows:
        if not isinstance(raw_row, dict):
            continue
        slot_token = _build_share_location_slot_token(raw_row)
        if slot_token and slot_token not in existing_location_by_slot:
            existing_location_by_slot[slot_token] = raw_row
        id_token = _build_share_location_id_lookup_token(raw_row)
        if id_token and id_token not in existing_location_by_id:
            existing_location_by_id[id_token] = raw_row

    counts = {
        'auto_import': {
            'song_favorites': 0,
            'mystery_song_assignments': 0,
            'song_location_assignments': 0,
        },
        'unchanged': {
            'song_favorites': 0,
            'mystery_song_assignments': 0,
            'song_location_assignments': 0,
        },
        'conflicts': {
            'song_favorites': 0,
            'mystery_song_assignments': 0,
            'song_location_assignments': 0,
        },
        'always_candidates': {
            'custom_songs': len(custom_rows),
            'song_location_user_nodes': len(location_user_node_rows),
        },
    }
    conflicts: list[dict[str, str]] = []
    auto_import_items: list[dict[str, str]] = []

    for raw_row in favorite_rows:
        if not isinstance(raw_row, dict):
            continue
        key = _build_share_favorite_conflict_key(raw_row)
        if not key:
            continue
        incoming_identity, incoming_title, incoming_artist, incoming_url = _read_song_identity_from_row(
            raw_row,
            title_keys=('title', 'song_title', 'songTitle'),
            artist_keys=('artist', 'song_artist', 'songArtist'),
            url_keys=('url', 'song_url', 'songUrl'),
        )
        if not (incoming_identity.get('url_key') or incoming_identity.get('title_key')):
            continue

        existing_row = existing_favorites_by_key.get(key)
        if not isinstance(existing_row, dict):
            counts['auto_import']['song_favorites'] += 1
            auto_import_items.append(_build_song_share_merge_item(
                key=key,
                item_type='song_favorites',
                slot_label=_build_song_share_slot_label(raw_row, 'song_favorites'),
                incoming_title=incoming_title,
                incoming_artist=incoming_artist,
                incoming_url=incoming_url,
            ))
            continue

        existing_identity, existing_title, existing_artist, existing_url = _read_song_identity_from_row(
            existing_row,
            title_keys=('title', 'song_title', 'songTitle'),
            artist_keys=('artist', 'song_artist', 'songArtist'),
            url_keys=('url', 'song_url', 'songUrl'),
        )
        if _is_song_identity_match(incoming_identity, existing_identity):
            counts['unchanged']['song_favorites'] += 1
            continue

        counts['conflicts']['song_favorites'] += 1
        conflicts.append(_build_song_share_merge_item(
            key=key,
            item_type='song_favorites',
            slot_label=_build_song_share_slot_label(raw_row, 'song_favorites'),
            incoming_title=incoming_title,
            incoming_artist=incoming_artist,
            incoming_url=incoming_url,
            existing_title=existing_title,
            existing_artist=existing_artist,
            existing_url=existing_url,
        ))

    for raw_row in mystery_rows:
        if not isinstance(raw_row, dict):
            continue
        key = _build_share_mystery_conflict_key(raw_row)
        if not key:
            continue
        incoming_identity, incoming_title, incoming_artist, incoming_url = _read_song_identity_from_row(
            raw_row,
            title_keys=('song_title', 'songTitle', 'title'),
            artist_keys=('song_artist', 'songArtist', 'artist'),
            url_keys=('song_url', 'songUrl', 'url'),
        )
        if not (incoming_identity.get('url_key') or incoming_identity.get('title_key')):
            continue

        existing_row = existing_mystery_by_key.get(key)
        if not isinstance(existing_row, dict):
            counts['auto_import']['mystery_song_assignments'] += 1
            auto_import_items.append(_build_song_share_merge_item(
                key=key,
                item_type='mystery_song_assignments',
                slot_label=_build_song_share_slot_label(raw_row, 'mystery_song_assignments'),
                incoming_title=incoming_title,
                incoming_artist=incoming_artist,
                incoming_url=incoming_url,
            ))
            continue

        existing_identity, existing_title, existing_artist, existing_url = _read_song_identity_from_row(
            existing_row,
            title_keys=('song_title', 'songTitle', 'title'),
            artist_keys=('song_artist', 'songArtist', 'artist'),
            url_keys=('song_url', 'songUrl', 'url'),
        )
        if _is_song_identity_match(incoming_identity, existing_identity):
            counts['unchanged']['mystery_song_assignments'] += 1
            continue

        counts['conflicts']['mystery_song_assignments'] += 1
        conflicts.append(_build_song_share_merge_item(
            key=key,
            item_type='mystery_song_assignments',
            slot_label=_build_song_share_slot_label(raw_row, 'mystery_song_assignments'),
            incoming_title=incoming_title,
            incoming_artist=incoming_artist,
            incoming_url=incoming_url,
            existing_title=existing_title,
            existing_artist=existing_artist,
            existing_url=existing_url,
        ))

    for raw_row in location_assignment_rows:
        if not isinstance(raw_row, dict):
            continue
        conflict_key = _build_share_location_conflict_key(raw_row)
        slot_token = _build_share_location_slot_token(raw_row)
        if not conflict_key or not slot_token:
            continue
        incoming_identity, incoming_title, incoming_artist, incoming_url = _read_song_identity_from_row(
            raw_row,
            title_keys=('song_title', 'songTitle', 'title'),
            artist_keys=('song_artist', 'songArtist', 'artist'),
            url_keys=('song_url', 'songUrl', 'url'),
        )
        if not (incoming_identity.get('url_key') or incoming_identity.get('title_key')):
            continue

        existing_row = existing_location_by_slot.get(slot_token)
        if not isinstance(existing_row, dict):
            id_token = _build_share_location_id_lookup_token(raw_row)
            if id_token:
                existing_row = existing_location_by_id.get(id_token)
        if not isinstance(existing_row, dict):
            counts['auto_import']['song_location_assignments'] += 1
            auto_import_items.append(_build_song_share_merge_item(
                key=conflict_key,
                item_type='song_location_assignments',
                slot_label=_build_song_share_slot_label(raw_row, 'song_location_assignments'),
                incoming_title=incoming_title,
                incoming_artist=incoming_artist,
                incoming_url=incoming_url,
            ))
            continue

        existing_identity, existing_title, existing_artist, existing_url = _read_song_identity_from_row(
            existing_row,
            title_keys=('song_title', 'songTitle', 'title'),
            artist_keys=('song_artist', 'songArtist', 'artist'),
            url_keys=('song_url', 'songUrl', 'url'),
        )
        if _is_song_identity_match(incoming_identity, existing_identity):
            counts['unchanged']['song_location_assignments'] += 1
            continue

        counts['conflicts']['song_location_assignments'] += 1
        conflicts.append(_build_song_share_merge_item(
            key=conflict_key,
            item_type='song_location_assignments',
            slot_label=_build_song_share_slot_label(raw_row, 'song_location_assignments'),
            incoming_title=incoming_title,
            incoming_artist=incoming_artist,
            incoming_url=incoming_url,
            existing_title=existing_title,
            existing_artist=existing_artist,
            existing_url=existing_url,
        ))

    totals = {
        'auto_import': sum(counts['auto_import'].values()) + counts['always_candidates']['custom_songs'],
        'unchanged': sum(counts['unchanged'].values()),
        'conflicts': sum(counts['conflicts'].values()),
    }

    return {
        'counts': counts,
        'totals': totals,
        'auto_import_items': auto_import_items,
        'conflicts': conflicts,
    }


def _build_custom_song_signature(
    *,
    title: str,
    key: str,
    lyrics_text: str,
    chords_text: str,
) -> tuple[str, str, str, str]:
    return (
        _normalize_song_match_token(title),
        _normalize_song_match_token(key),
        _normalize_song_match_token(lyrics_text),
        _normalize_song_match_token(chords_text),
    )


def _create_song_share_control(source_user: dict[str, str]) -> dict[str, object]:
    created_at = _now_utc()
    expires_at = created_at + timedelta(hours=max(1, settings.song_share_ttl_hours))
    return {
        'created_at_utc': _to_utc_iso(created_at),
        'expires_at_utc': _to_utc_iso(expires_at),
        'source': {
            'user_guid': _normalize_spaces(str(source_user.get('guid') or '')),
            'name': _normalize_spaces(str(source_user.get('name') or '')),
        },
    }


def _build_song_share_live_data(store_namespace: str) -> dict[str, list[dict[str, object]]]:
    custom_songs = list_custom_songs(
        settings.custom_songs_file,
        include_inactive=False,
        database_url=settings.database_url,
        store_namespace=store_namespace,
    )
    mystery_song_assignments = list_mystery_song_assignments(
        settings.mystery_song_assignments_file,
        database_url=settings.database_url,
        store_namespace=store_namespace,
    )
    song_location_assignments = list_song_location_assignments(
        settings.song_location_assignments_file,
        database_url=settings.database_url,
        store_namespace=store_namespace,
    )
    song_location_user_nodes = list_song_location_user_nodes(
        settings.song_location_user_nodes_file,
        include_inactive=False,
        database_url=settings.database_url,
        store_namespace=store_namespace,
    )
    song_favorites = list_song_favorites(
        settings.song_favorites_file,
        database_url=settings.database_url,
        store_namespace=store_namespace,
    )

    return {
        'custom_songs': _truncate_song_share_rows(custom_songs),
        'mystery_song_assignments': _truncate_song_share_rows(mystery_song_assignments),
        'song_location_assignments': _truncate_song_share_rows(song_location_assignments),
        'song_location_user_nodes': _truncate_song_share_rows(song_location_user_nodes),
        'song_favorites': _truncate_song_share_rows(song_favorites),
    }


def _load_song_share_control(share_id: str) -> dict[str, object] | None:
    if not settings.database_url:
        return None
    payload = load_store(settings.database_url, _build_song_share_store_key(share_id))
    if not isinstance(payload, dict):
        return None
    source_payload = payload.get('source') if isinstance(payload.get('source'), dict) else {}
    source_guid = _normalize_spaces(str(source_payload.get('user_guid') or source_payload.get('guid') or ''))
    if not source_guid:
        return None
    if _is_song_share_snapshot_expired(payload):
        return None
    return {
        'created_at_utc': _normalize_spaces(str(payload.get('created_at_utc') or '')),
        'expires_at_utc': _normalize_spaces(str(payload.get('expires_at_utc') or '')),
        'source': {
            'user_guid': source_guid,
            'name': _normalize_spaces(str(source_payload.get('name') or '')),
        },
    }


def _build_song_share_snapshot_from_control(share_control: dict[str, object]) -> dict[str, object] | None:
    source_payload = share_control.get('source') if isinstance(share_control.get('source'), dict) else {}
    source_guid = _normalize_spaces(str(source_payload.get('user_guid') or source_payload.get('guid') or ''))
    if not source_guid:
        return None

    source_name = _normalize_spaces(str(source_payload.get('name') or ''))
    created_at_utc = _normalize_spaces(str(share_control.get('created_at_utc') or ''))
    expires_at_utc = _normalize_spaces(str(share_control.get('expires_at_utc') or ''))
    try:
        live_data = _build_song_share_live_data(source_guid)
    except Exception:
        return None

    return {
        'created_at_utc': created_at_utc,
        'expires_at_utc': expires_at_utc,
        'source': {
            'user_guid': source_guid,
            'name': source_name,
        },
        'data': live_data,
    }


def _import_shared_custom_songs(store_namespace: str, rows: list[dict[str, object]]) -> dict[str, int]:
    existing_rows = list_custom_songs(
        settings.custom_songs_file,
        include_inactive=False,
        database_url=settings.database_url,
        store_namespace=store_namespace,
    )
    existing_signatures = {
        _build_custom_song_signature(
            title=str(item.get('title') or ''),
            key=str(item.get('key') or ''),
            lyrics_text=str(item.get('lyrics_text') or item.get('lyricsText') or ''),
            chords_text=str(item.get('chords_text') or item.get('chordsText') or ''),
        )
        for item in existing_rows
        if isinstance(item, dict)
    }

    added = 0
    skipped = 0
    for raw_row in rows:
        title = _normalize_spaces(str(raw_row.get('title') or ''))
        key = _normalize_spaces(str(raw_row.get('key') or ''))
        lyrics_text = str(raw_row.get('lyrics_text') or raw_row.get('lyricsText') or '')
        chords_text = str(raw_row.get('chords_text') or raw_row.get('chordsText') or '')
        if not title:
            skipped += 1
            continue

        signature = _build_custom_song_signature(
            title=title,
            key=key,
            lyrics_text=lyrics_text,
            chords_text=chords_text,
        )
        if signature in existing_signatures:
            skipped += 1
            continue

        create_custom_song(
            settings.custom_songs_file,
            CustomSongUpsertRequest(
                title=title,
                key=key,
                lyrics_text=lyrics_text,
                chords_text=chords_text,
            ),
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
        existing_signatures.add(signature)
        added += 1

    return {
        'added': added,
        'skipped': skipped,
    }


def _import_shared_mystery_song_assignments(store_namespace: str, rows: list[dict[str, object]]) -> dict[str, int]:
    applied = 0
    skipped = 0
    for raw_row in rows:
        group_title = _normalize_spaces(str(raw_row.get('group_title') or raw_row.get('groupTitle') or ''))
        mystery_title = _normalize_spaces(str(raw_row.get('mystery_title') or raw_row.get('mysteryTitle') or ''))
        if not group_title or not mystery_title:
            skipped += 1
            continue
        song_title = _normalize_spaces(str(raw_row.get('song_title') or raw_row.get('songTitle') or ''))
        song_url = _normalize_spaces(str(raw_row.get('song_url') or raw_row.get('songUrl') or ''))
        if not song_title and not song_url:
            skipped += 1
            continue

        upsert_mystery_song_assignment(
            settings.mystery_song_assignments_file,
            MysterySongAssignmentUpsertRequest(
                group_title=group_title,
                group_day=_normalize_spaces(str(raw_row.get('group_day') or raw_row.get('groupDay') or '')),
                mystery_title=mystery_title,
                song_title=song_title,
                song_artist=_normalize_spaces(str(raw_row.get('song_artist') or raw_row.get('songArtist') or '')),
                song_url=song_url,
                source=_normalize_spaces(str(raw_row.get('source') or '')),
                source_label=_normalize_spaces(str(raw_row.get('source_label') or raw_row.get('sourceLabel') or '')),
                image_url=_normalize_spaces(str(raw_row.get('image_url') or raw_row.get('imageUrl') or '')),
                lyrics_text=str(raw_row.get('lyrics_text') or raw_row.get('lyricsText') or ''),
                lyrics_source=_normalize_spaces(str(raw_row.get('lyrics_source') or raw_row.get('lyricsSource') or '')),
                lyrics_source_url=_normalize_spaces(
                    str(raw_row.get('lyrics_source_url') or raw_row.get('lyricsSourceUrl') or '')
                ),
            ),
            favorites_file=settings.song_favorites_file,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
        applied += 1

    return {
        'applied': applied,
        'skipped': skipped,
    }


def _import_shared_song_location_user_nodes(store_namespace: str, rows: list[dict[str, object]]) -> dict[str, object]:
    imported_rows = [
        _normalize_song_location_node_row(raw_row)
        for raw_row in rows
    ]
    imported_rows = [
        row
        for row in imported_rows
        if isinstance(row, dict)
        and row.get('node_id')
        and row.get('label')
        and _coerce_bool(row.get('is_active'), default=True)
    ]
    if not imported_rows:
        return {
            'mapped_node_ids': {},
            'added': 0,
            'matched': 0,
            'skipped': 0,
        }

    global_payload = list_song_location_tree(
        settings.song_locations_file,
        portal_content_file=PORTAL_CONTENT_FILE,
        include_inactive=True,
    )
    existing_user_nodes = list_song_location_user_nodes(
        settings.song_location_user_nodes_file,
        include_inactive=True,
        database_url=settings.database_url,
        store_namespace=store_namespace,
    )
    merged_payload = _merge_song_location_payloads(
        global_payload,
        existing_user_nodes,
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

    existing_key_to_id: dict[str, str] = {}
    for raw_row in existing_user_nodes:
        normalized = _normalize_song_location_node_row(raw_row)
        if not normalized or not _coerce_bool(normalized.get('is_active'), default=True):
            continue
        key = f"{str(normalized.get('parent_id') or '')}|{_normalize_song_match_token(str(normalized.get('label') or ''))}"
        existing_id = _normalize_spaces(str(normalized.get('node_id') or ''))
        if key and existing_id:
            existing_key_to_id[key] = existing_id

    imported_by_id = {
        str(row.get('node_id') or ''): row
        for row in imported_rows
        if str(row.get('node_id') or '')
    }
    pending_rows = [row for row in imported_rows if str(row.get('node_id') or '')]
    mapped_node_ids: dict[str, str] = {}
    added = 0
    matched = 0
    skipped = 0

    # Resolve parent-first creation. If parents are invalid/missing, fallback to root.
    for _ in range(max(1, len(pending_rows) + 2)):
        if not pending_rows:
            break
        progressed = False
        next_pending: list[dict[str, object]] = []
        for row in pending_rows:
            old_node_id = _normalize_spaces(str(row.get('node_id') or ''))
            old_parent_id = _normalize_spaces(str(row.get('parent_id') or ''))
            label = _normalize_spaces(str(row.get('label') or ''))
            if not old_node_id or not label:
                skipped += 1
                progressed = True
                continue

            if old_parent_id and old_parent_id in imported_by_id and old_parent_id not in mapped_node_ids:
                next_pending.append(row)
                continue

            resolved_parent_id = ''
            if old_parent_id and old_parent_id in mapped_node_ids:
                resolved_parent_id = mapped_node_ids[old_parent_id]
            elif old_parent_id and old_parent_id in valid_parent_ids:
                resolved_parent_id = old_parent_id

            dedupe_key = f'{resolved_parent_id}|{_normalize_song_match_token(label)}'
            matched_node_id = existing_key_to_id.get(dedupe_key, '')
            if matched_node_id:
                mapped_node_ids[old_node_id] = matched_node_id
                matched += 1
                progressed = True
                continue

            created = create_song_location_user_node(
                settings.song_location_user_nodes_file,
                SongLocationNodeCreateRequest(
                    parent_id=resolved_parent_id,
                    label=label,
                ),
                valid_parent_ids=valid_parent_ids,
                database_url=settings.database_url,
                store_namespace=store_namespace,
            )
            created_node_id = _normalize_spaces(str(created.get('node_id') or created.get('nodeId') or ''))
            if not created_node_id:
                skipped += 1
                progressed = True
                continue
            mapped_node_ids[old_node_id] = created_node_id
            existing_key_to_id[dedupe_key] = created_node_id
            valid_parent_ids.add(created_node_id)
            added += 1
            progressed = True

        if not progressed:
            # Fallback: unresolved cyclic/orphan parent references become root nodes.
            for row in next_pending:
                row['parent_id'] = ''
            pending_rows = next_pending
            continue
        pending_rows = next_pending

    if pending_rows:
        skipped += len(pending_rows)

    return {
        'mapped_node_ids': mapped_node_ids,
        'added': added,
        'matched': matched,
        'skipped': skipped,
    }


def _import_shared_song_location_assignments(
    store_namespace: str,
    rows: list[dict[str, object]],
    mapped_node_ids: dict[str, str] | None = None,
) -> dict[str, int]:
    safe_mapping = mapped_node_ids if isinstance(mapped_node_ids, dict) else {}
    applied = 0
    skipped = 0
    for raw_row in rows:
        source_location_id = _normalize_spaces(str(raw_row.get('location_id') or raw_row.get('locationId') or ''))
        location_id = _normalize_spaces(str(safe_mapping.get(source_location_id) or source_location_id))
        if not location_id:
            skipped += 1
            continue

        song_title = _normalize_spaces(str(raw_row.get('song_title') or raw_row.get('songTitle') or ''))
        song_url = _normalize_spaces(str(raw_row.get('song_url') or raw_row.get('songUrl') or ''))
        if not song_title and not song_url:
            skipped += 1
            continue

        raw_path = raw_row.get('location_path')
        if not isinstance(raw_path, list):
            raw_path = raw_row.get('locationPath')
        location_path = [
            _normalize_spaces(str(item))
            for item in raw_path
            if isinstance(raw_path, list) and _normalize_spaces(str(item))
        ] if isinstance(raw_path, list) else []

        upsert_song_location_assignment(
            settings.song_location_assignments_file,
            SongLocationAssignmentUpsertRequest(
                location_id=location_id,
                location_label=_normalize_spaces(str(raw_row.get('location_label') or raw_row.get('locationLabel') or '')),
                location_path=location_path,
                song_title=song_title,
                song_artist=_normalize_spaces(str(raw_row.get('song_artist') or raw_row.get('songArtist') or '')),
                song_url=song_url,
                source=_normalize_spaces(str(raw_row.get('source') or '')),
                source_label=_normalize_spaces(str(raw_row.get('source_label') or raw_row.get('sourceLabel') or '')),
                image_url=_normalize_spaces(str(raw_row.get('image_url') or raw_row.get('imageUrl') or '')),
                lyrics_text=str(raw_row.get('lyrics_text') or raw_row.get('lyricsText') or ''),
                lyrics_source=_normalize_spaces(str(raw_row.get('lyrics_source') or raw_row.get('lyricsSource') or '')),
                lyrics_source_url=_normalize_spaces(
                    str(raw_row.get('lyrics_source_url') or raw_row.get('lyricsSourceUrl') or '')
                ),
            ),
            favorites_file=settings.song_favorites_file,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
        applied += 1

    return {
        'applied': applied,
        'skipped': skipped,
    }


def _import_shared_song_favorites(store_namespace: str, rows: list[dict[str, object]]) -> dict[str, int]:
    applied = 0
    skipped = 0
    for raw_row in rows:
        song_url = _normalize_spaces(str(raw_row.get('url') or raw_row.get('song_url') or ''))
        if not song_url:
            skipped += 1
            continue

        try:
            save_song_favorite(
                settings.song_favorites_file,
                SongFavoriteCreateRequest(
                    url=song_url,
                    title=_normalize_spaces(str(raw_row.get('title') or '')),
                    artist=_normalize_spaces(str(raw_row.get('artist') or '')),
                    source=_normalize_spaces(str(raw_row.get('source') or '')),
                    source_label=_normalize_spaces(str(raw_row.get('source_label') or raw_row.get('sourceLabel') or '')),
                    image_url=_normalize_spaces(str(raw_row.get('image_url') or raw_row.get('imageUrl') or '')),
                    spotify_url=_normalize_spaces(str(raw_row.get('spotify_url') or raw_row.get('spotifyUrl') or '')),
                    youtube_url=_normalize_spaces(str(raw_row.get('youtube_url') or raw_row.get('youtubeUrl') or '')),
                    lyrics_text=str(raw_row.get('lyrics_text') or raw_row.get('lyricsText') or ''),
                    lyrics_source=_normalize_spaces(str(raw_row.get('lyrics_source') or raw_row.get('lyricsSource') or '')),
                    lyrics_source_url=_normalize_spaces(
                        str(raw_row.get('lyrics_source_url') or raw_row.get('lyricsSourceUrl') or '')
                    ),
                    chords_text=str(raw_row.get('chords_text') or raw_row.get('chordsText') or ''),
                    chords_source=_normalize_spaces(str(raw_row.get('chords_source') or raw_row.get('chordsSource') or '')),
                    chords_source_url=_normalize_spaces(
                        str(raw_row.get('chords_source_url') or raw_row.get('chordsSourceUrl') or '')
                    ),
                    chords_original_key=_normalize_spaces(
                        str(raw_row.get('chords_original_key') or raw_row.get('chordsOriginalKey') or '')
                    ),
                    chords_selected_key=_normalize_spaces(
                        str(raw_row.get('chords_selected_key') or raw_row.get('chordsSelectedKey') or '')
                    ),
                    prefetch_chords_on_save=False,
                ),
                database_url=settings.database_url,
                store_namespace=store_namespace,
            )
            applied += 1
        except Exception:
            skipped += 1

    return {
        'applied': applied,
        'skipped': skipped,
    }


def _import_song_share_snapshot(
    share_snapshot: dict[str, object],
    target_namespace: str,
    exclude_conflict_keys: set[str] | None = None,
) -> dict[str, object]:
    share_data = share_snapshot.get('data') if isinstance(share_snapshot.get('data'), dict) else {}
    custom_rows = _truncate_song_share_rows(share_data.get('custom_songs'))
    mystery_rows = _truncate_song_share_rows(share_data.get('mystery_song_assignments'))
    location_assignment_rows = _truncate_song_share_rows(share_data.get('song_location_assignments'))
    location_user_node_rows = _truncate_song_share_rows(share_data.get('song_location_user_nodes'))
    favorite_rows = _truncate_song_share_rows(share_data.get('song_favorites'))
    excluded_keys = exclude_conflict_keys if isinstance(exclude_conflict_keys, set) else set()
    excluded_conflicts = {
        'song_favorites': 0,
        'mystery_song_assignments': 0,
        'song_location_assignments': 0,
    }

    if excluded_keys:
        filtered_mystery_rows: list[dict[str, object]] = []
        for row in mystery_rows:
            conflict_key = _normalize_song_share_conflict_key(_build_share_mystery_conflict_key(row))
            if conflict_key and conflict_key in excluded_keys:
                excluded_conflicts['mystery_song_assignments'] += 1
                continue
            filtered_mystery_rows.append(row)
        mystery_rows = filtered_mystery_rows

        filtered_location_rows: list[dict[str, object]] = []
        for row in location_assignment_rows:
            conflict_key = _normalize_song_share_conflict_key(_build_share_location_conflict_key(row))
            if conflict_key and conflict_key in excluded_keys:
                excluded_conflicts['song_location_assignments'] += 1
                continue
            filtered_location_rows.append(row)
        location_assignment_rows = filtered_location_rows

        filtered_favorite_rows: list[dict[str, object]] = []
        for row in favorite_rows:
            conflict_key = _normalize_song_share_conflict_key(_build_share_favorite_conflict_key(row))
            if conflict_key and conflict_key in excluded_keys:
                excluded_conflicts['song_favorites'] += 1
                continue
            filtered_favorite_rows.append(row)
        favorite_rows = filtered_favorite_rows

    custom_summary = _import_shared_custom_songs(target_namespace, custom_rows)
    mystery_summary = _import_shared_mystery_song_assignments(target_namespace, mystery_rows)
    location_nodes_summary = _import_shared_song_location_user_nodes(target_namespace, location_user_node_rows)
    location_assignments_summary = _import_shared_song_location_assignments(
        target_namespace,
        location_assignment_rows,
        mapped_node_ids=location_nodes_summary.get('mapped_node_ids') if isinstance(location_nodes_summary, dict) else {},
    )
    favorites_summary = _import_shared_song_favorites(target_namespace, favorite_rows)

    return {
        'custom_songs': custom_summary,
        'mystery_song_assignments': mystery_summary,
        'song_location_user_nodes': {
            'added': _coerce_int(location_nodes_summary.get('added'), 0),
            'matched': _coerce_int(location_nodes_summary.get('matched'), 0),
            'skipped': _coerce_int(location_nodes_summary.get('skipped'), 0),
        },
        'song_location_assignments': location_assignments_summary,
        'song_favorites': favorites_summary,
        'excluded_conflicts': excluded_conflicts,
    }


@app.post('/api/songs/share/create')
def api_song_share_create(
    request: Request,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    _enforce_share_rate_limit(request)

    if not settings.database_url:
        raise HTTPException(status_code=503, detail={'message': 'Compartilhamento indisponivel sem PostgreSQL configurado.'})

    token = _extract_bearer_token(authorization)
    try:
        source_user_payload = get_authenticated_user(settings.database_url, token)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={'message': str(exc)}) from exc

    store_namespace = _normalize_spaces(str(source_user_payload.get('guid') or ''))
    if not store_namespace:
        raise HTTPException(status_code=401, detail={'message': 'Sessão inválida.'})

    source_user = {
        'guid': store_namespace,
        'name': _normalize_spaces(str(source_user_payload.get('name') or '')),
    }

    try:
        share_control_payload = _create_song_share_control(source_user)
        snapshot_payload = _build_song_share_snapshot_from_control(share_control_payload)
        if not snapshot_payload:
            raise RuntimeError('Falha ao carregar dados da origem para compartilhamento.')

        share_id = ''
        for _ in range(8):
            generated = _generate_song_share_id()
            try:
                candidate = _normalize_song_share_id(generated)
            except ValueError:
                continue
            if _load_song_share_control(candidate) is None:
                share_id = candidate
                break
        if not share_id:
            raise RuntimeError('Falha ao gerar código de compartilhamento.')

        save_store(
            settings.database_url,
            _build_song_share_store_key(share_id),
            share_control_payload,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    share_url = _build_portal_url_with_query(request, {SONG_SHARE_QUERY_KEY: share_id})
    qr_image_data_url = _build_auth_qr_svg_data_url(share_url)
    if not share_url or not qr_image_data_url:
        raise HTTPException(status_code=503, detail={'message': 'Falha ao gerar link/QR de compartilhamento.'})

    counts = _build_song_share_counts(snapshot_payload)
    return {
        'ok': True,
        'share_id': share_id,
        'share_url': share_url,
        'qr_image_data_url': qr_image_data_url,
        'created_at_utc': _normalize_spaces(str(snapshot_payload.get('created_at_utc') or '')),
        'expires_at_utc': _normalize_spaces(str(snapshot_payload.get('expires_at_utc') or '')),
        'source': {
            'name': source_user.get('name') or '',
        },
        'counts': counts,
        'total_items': sum(counts.values()),
    }


@app.get('/api/songs/share/preview')
def api_song_share_preview(
    request: Request,
    share_id: str = Query(..., min_length=8, max_length=80),
) -> dict[str, object]:
    _enforce_share_rate_limit(request)

    if not settings.database_url:
        raise HTTPException(status_code=503, detail={'message': 'Compartilhamento indisponivel sem PostgreSQL configurado.'})

    try:
        normalized_share_id = _normalize_song_share_id(share_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc

    try:
        share_control = _load_song_share_control(normalized_share_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc
    if not share_control:
        raise HTTPException(status_code=404, detail={'message': 'Compartilhamento não encontrado.'})

    share_snapshot = _build_song_share_snapshot_from_control(share_control)
    if not share_snapshot:
        raise HTTPException(status_code=404, detail={'message': 'Compartilhamento não encontrado.'})
    source_payload = share_snapshot.get('source') if isinstance(share_snapshot.get('source'), dict) else {}
    counts = _build_song_share_counts(share_snapshot)
    return {
        'ok': True,
        'share_id': normalized_share_id,
        'created_at_utc': _normalize_spaces(str(share_snapshot.get('created_at_utc') or '')),
        'expires_at_utc': _normalize_spaces(str(share_snapshot.get('expires_at_utc') or '')),
        'source': {
            'name': _normalize_spaces(str(source_payload.get('name') or '')),
        },
        'counts': counts,
        'total_items': sum(counts.values()),
    }


@app.get('/api/songs/share/view')
def api_song_share_view(
    request: Request,
    share_id: str = Query(..., min_length=8, max_length=80),
) -> dict[str, object]:
    _enforce_share_rate_limit(request)

    if not settings.database_url:
        raise HTTPException(status_code=503, detail={'message': 'Compartilhamento indisponivel sem PostgreSQL configurado.'})

    try:
        normalized_share_id = _normalize_song_share_id(share_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc

    try:
        share_control = _load_song_share_control(normalized_share_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc
    if not share_control:
        raise HTTPException(status_code=404, detail={'message': 'Compartilhamento não encontrado.'})

    share_snapshot = _build_song_share_snapshot_from_control(share_control)
    if not share_snapshot:
        raise HTTPException(status_code=404, detail={'message': 'Compartilhamento não encontrado.'})
    counts = _build_song_share_counts(share_snapshot)
    share_url = _build_portal_url_with_query(request, {SONG_SHARE_QUERY_KEY: normalized_share_id})
    qr_image_data_url = _build_auth_qr_svg_data_url(share_url) if share_url else ''
    return {
        'ok': True,
        'share_id': normalized_share_id,
        'share_url': share_url,
        'qr_image_data_url': qr_image_data_url,
        'created_at_utc': _normalize_spaces(str(share_snapshot.get('created_at_utc') or '')),
        'expires_at_utc': _normalize_spaces(str(share_snapshot.get('expires_at_utc') or '')),
        'data': _build_song_share_view_data(share_snapshot),
        'counts': counts,
        'total_items': sum(counts.values()),
    }


@app.get('/api/songs/share/merge-preview')
def api_song_share_merge_preview(
    request: Request,
    share_id: str = Query(..., min_length=8, max_length=80),
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    _enforce_share_rate_limit(request)

    if not settings.database_url:
        raise HTTPException(status_code=503, detail={'message': 'Compartilhamento indisponivel sem PostgreSQL configurado.'})

    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        normalized_share_id = _normalize_song_share_id(share_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc

    try:
        share_control = _load_song_share_control(normalized_share_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc
    if not share_control:
        raise HTTPException(status_code=404, detail={'message': 'Compartilhamento nÃ£o encontrado.'})

    share_snapshot = _build_song_share_snapshot_from_control(share_control)
    if not share_snapshot:
        raise HTTPException(status_code=404, detail={'message': 'Compartilhamento nÃ£o encontrado.'})

    source_payload = share_snapshot.get('source') if isinstance(share_snapshot.get('source'), dict) else {}
    try:
        merge_plan = _build_song_share_merge_plan(share_snapshot, store_namespace)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'share_id': normalized_share_id,
        'source': {
            'name': _normalize_spaces(str(source_payload.get('name') or '')),
        },
        **merge_plan,
    }


@app.post('/api/songs/share/import')
def api_song_share_import(
    request: Request,
    payload: SongShareImportRequest,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    _enforce_share_rate_limit(request)

    if not settings.database_url:
        raise HTTPException(status_code=503, detail={'message': 'Compartilhamento indisponivel sem PostgreSQL configurado.'})

    store_namespace = _resolve_user_store_namespace_from_auth_header(authorization)
    try:
        normalized_share_id = _normalize_song_share_id(payload.share_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc

    try:
        share_control = _load_song_share_control(normalized_share_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc
    if not share_control:
        raise HTTPException(status_code=404, detail={'message': 'Compartilhamento não encontrado.'})

    share_snapshot = _build_song_share_snapshot_from_control(share_control)
    if not share_snapshot:
        raise HTTPException(status_code=404, detail={'message': 'Compartilhamento não encontrado.'})
    source_payload = share_snapshot.get('source') if isinstance(share_snapshot.get('source'), dict) else {}
    excluded_conflict_keys = _normalize_song_share_conflict_keys(payload.exclude_conflict_keys)
    try:
        summary = _import_song_share_snapshot(
            share_snapshot,
            store_namespace,
            exclude_conflict_keys=excluded_conflict_keys,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'share_id': normalized_share_id,
        'source': {
            'name': _normalize_spaces(str(source_payload.get('name') or '')),
        },
        'summary': summary,
    }


@app.get('/api/health')
def api_health() -> dict[str, object]:
    return {
        'status': 'ok',
        'service': 'portal-schoenstatt-api',
        'database_configured': bool(settings.database_url),
        'songs_storage_backend': 'postgresql' if settings.database_url else 'json',
        'cors_allow_origins': settings.cors_allow_origins,
        'song_share_ttl_hours': settings.song_share_ttl_hours,
        'song_location_delete_password_required': bool(settings.song_location_delete_password),
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
            'Com DATABASE_URL definido, favoritos/músicas manuais/vínculos são salvos no PostgreSQL.'
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
        safe_url = _normalize_spaces(url)
        favorite_identity = _build_song_identity(safe_url, '', '')
        favorite_url_key = _normalize_song_url_key(safe_url)

        favorites = list_song_favorites(
            settings.song_favorites_file,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
        for favorite in favorites:
            favorite_url = str(favorite.get('url') or favorite.get('song_url') or '')
            if _normalize_song_url_key(favorite_url) != favorite_url_key:
                continue

            favorite_identity = _build_song_identity(
                favorite_url,
                str(favorite.get('title') or favorite.get('song_title') or ''),
                str(favorite.get('artist') or favorite.get('song_artist') or ''),
            )
            break

        removed = delete_song_favorite(
            settings.song_favorites_file,
            url,
            database_url=settings.database_url,
            store_namespace=store_namespace,
        )
        assignment_cleanup = _build_empty_song_assignment_cleanup_payload()
        if removed:
            assignment_cleanup = _cleanup_song_assignments_for_identity(favorite_identity, store_namespace)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'removed': removed,
        'assignment_cleanup': assignment_cleanup,
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
        status_code = 404 if message == 'Categoria/subcategoria não encontrada.' else 400
        raise HTTPException(status_code=status_code, detail={'message': message}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **delete_payload,
        'assignment_cleanup': assignment_cleanup,
    }


@app.put('/api/song-locations/nodes/{node_id}')
def api_song_locations_update_node(
    node_id: str,
    payload: SongLocationNodeUpdateRequest,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    _resolve_user_store_namespace_from_auth_header(authorization)

    try:
        node = update_song_location_node(
            settings.song_locations_file,
            node_id,
            payload,
            portal_content_file=PORTAL_CONTENT_FILE,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if message == 'Categoria/subcategoria não encontrada.' else 400
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
    authorization: str = Header('', alias='Authorization'),
    location_delete_password: str = Header('', alias='X-Location-Delete-Password'),
) -> dict[str, object]:
    _resolve_user_store_namespace_from_auth_header(authorization)

    expected_password = str(settings.song_location_delete_password or '').strip()
    provided_password = str(location_delete_password or '')
    if expected_password and not compare_digest(provided_password, expected_password):
        raise HTTPException(
            status_code=403,
            detail={
                'message': 'Senha inválida para inativar o item.',
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
        status_code = 404 if message == 'Categoria/subcategoria não encontrada.' else 400
        raise HTTPException(status_code=status_code, detail={'message': message}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **payload,
    }


@app.put('/api/song-locations/nodes/{node_id}/restore')
def api_song_locations_restore_node(
    node_id: str,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    _resolve_user_store_namespace_from_auth_header(authorization)

    try:
        payload = restore_song_location_node(
            settings.song_locations_file,
            node_id,
            portal_content_file=PORTAL_CONTENT_FILE,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if message == 'Categoria/subcategoria não encontrada.' else 400
        raise HTTPException(status_code=status_code, detail={'message': message}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **payload,
    }


@app.put('/api/song-locations/reorder')
def api_song_locations_reorder_nodes(
    payload: SongLocationNodeReorderRequest,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    _resolve_user_store_namespace_from_auth_header(authorization)

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


@app.post('/api/auth/register')
def api_auth_register(payload: AuthRegisterRequest, request: Request) -> dict[str, object]:
    _enforce_auth_rate_limit(request)

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
    _enforce_auth_rate_limit(request)

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


@app.post('/api/auth/qr/start')
def api_auth_qr_start(request: Request) -> dict[str, object]:
    _enforce_auth_rate_limit(request)

    try:
        qr_payload = create_qr_login_session(
            settings.database_url,
            user_agent=request.headers.get('user-agent', ''),
            forwarded_for=request.headers.get('x-forwarded-for', ''),
            client_ip=request.client.host if request.client else '',
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={'message': str(exc)}) from exc

    session_guid = _normalize_spaces(str(qr_payload.get('session_guid') or ''))
    approve_token = _normalize_spaces(str(qr_payload.get('approve_token') or ''))
    poll_token = _normalize_spaces(str(qr_payload.get('poll_token') or ''))
    expires_at_utc = _normalize_spaces(str(qr_payload.get('expires_at_utc') or ''))
    expires_in_seconds = _coerce_int(qr_payload.get('expires_in_seconds'), 0)
    approve_url = _build_auth_qr_approve_url(request, session_guid, approve_token)
    qr_image_data_url = _build_auth_qr_svg_data_url(approve_url)

    if not session_guid or not poll_token or not approve_url or not qr_image_data_url:
        raise HTTPException(
            status_code=503,
            detail={'message': 'Falha ao gerar QR Code de autenticação.'},
        )

    return {
        'ok': True,
        'session_guid': session_guid,
        'poll_token': poll_token,
        'approve_url': approve_url,
        'qr_image_data_url': qr_image_data_url,
        'expires_at_utc': expires_at_utc,
        'expires_in_seconds': expires_in_seconds,
    }


@app.get('/api/auth/qr/status')
def api_auth_qr_status(
    request: Request,
    session_guid: str = Query(..., min_length=1),
    poll_token: str = Query(..., min_length=1),
) -> dict[str, object]:
    _enforce_auth_rate_limit(request)

    try:
        status_payload = get_qr_login_session_status(
            settings.database_url,
            session_guid,
            poll_token,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **status_payload,
    }


@app.post('/api/auth/qr/approve')
def api_auth_qr_approve(
    payload: AuthQrApproveRequest,
    request: Request,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    _enforce_auth_rate_limit(request)

    token = _extract_bearer_token(authorization)
    try:
        approval_payload = approve_qr_login_session(
            settings.database_url,
            payload,
            token,
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
        **approval_payload,
    }


@app.post('/api/auth/qr/complete')
def api_auth_qr_complete(payload: AuthQrCompleteRequest, request: Request) -> dict[str, object]:
    _enforce_auth_rate_limit(request)

    try:
        auth_payload = complete_qr_login_session(
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


@app.get('/api/auth/sessions')
def api_auth_sessions(authorization: str = Header('', alias='Authorization')) -> dict[str, object]:
    token = _extract_bearer_token(authorization)

    try:
        payload = list_authenticated_user_sessions(settings.database_url, token)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={'message': str(exc)}) from exc

    sessions = payload.get('sessions') if isinstance(payload.get('sessions'), list) else []
    return {
        'ok': True,
        **payload,
        'count': len(sessions),
    }


@app.delete('/api/auth/sessions/{session_guid}')
def api_auth_sessions_delete(
    session_guid: str,
    authorization: str = Header('', alias='Authorization'),
) -> dict[str, object]:
    token = _extract_bearer_token(authorization)

    try:
        payload = logout_authenticated_user_session(
            settings.database_url,
            token,
            session_guid,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if message == 'Sessão não encontrada ou já encerrada.' else 400
        raise HTTPException(status_code=status_code, detail={'message': message}) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **payload,
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
        status_code = 404 if message == 'Música manual não encontrada.' else 400
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
        status_code = 404 if message == 'Música manual não encontrada.' else 400
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
        status_code = 404 if message == 'Música manual não encontrada.' else 400
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
        if message == 'Não foi possível gerar letra a partir da cifra.':
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
    raise HTTPException(status_code=404, detail='Manifest não encontrado')


@app.get('/{file_name}', include_in_schema=False)
def top_level_files(file_name: str) -> FileResponse:
    safe_name = Path(file_name).name
    if safe_name not in ROOT_PUBLIC_FILES:
        raise HTTPException(status_code=404, detail='Arquivo não encontrado')

    file_path = PROJECT_DIR / safe_name

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail='Arquivo não encontrado')

    return FileResponse(file_path)
