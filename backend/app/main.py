from __future__ import annotations

from hmac import compare_digest
from pathlib import Path
import unicodedata

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

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
def api_song_favorites_list() -> dict[str, object]:
    try:
        favorites = list_song_favorites(
            settings.song_favorites_file,
            database_url=settings.database_url,
        )
        mystery_assignments = list_mystery_song_assignments(
            settings.mystery_song_assignments_file,
            database_url=settings.database_url,
        )
        location_assignments = list_song_location_assignments(
            settings.song_location_assignments_file,
            database_url=settings.database_url,
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
def api_song_favorites_save(payload: SongFavoriteCreateRequest) -> dict[str, object]:
    try:
        favorite = save_song_favorite(
            settings.song_favorites_file,
            payload,
            database_url=settings.database_url,
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
def api_song_favorites_delete(url: str = Query(..., min_length=1)) -> dict[str, object]:
    try:
        removed = delete_song_favorite(
            settings.song_favorites_file,
            url,
            database_url=settings.database_url,
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
def api_song_favorites_reorder(payload: SongFavoriteReorderRequest) -> dict[str, object]:
    try:
        favorites = reorder_song_favorites(
            settings.song_favorites_file,
            payload.ordered_ids,
            database_url=settings.database_url,
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
def api_mystery_song_assignments_list() -> dict[str, object]:
    try:
        assignments = list_mystery_song_assignments(
            settings.mystery_song_assignments_file,
            database_url=settings.database_url,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'count': len(assignments),
        'assignments': assignments,
    }


@app.post('/api/mysteries/song-assignments')
def api_mystery_song_assignments_upsert(payload: MysterySongAssignmentUpsertRequest) -> dict[str, object]:
    try:
        assignment = upsert_mystery_song_assignment(
            settings.mystery_song_assignments_file,
            payload,
            favorites_file=settings.song_favorites_file,
            database_url=settings.database_url,
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
) -> dict[str, object]:
    try:
        removed = delete_mystery_song_assignment(
            settings.mystery_song_assignments_file,
            group_title,
            mystery_title,
            database_url=settings.database_url,
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
def api_song_locations_list(include_inactive: bool = Query(False)) -> dict[str, object]:
    try:
        payload = list_song_location_tree(
            settings.song_locations_file,
            portal_content_file=PORTAL_CONTENT_FILE,
            include_inactive=include_inactive,
            database_url=settings.database_url,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        **payload,
    }


@app.post('/api/song-locations/nodes')
def api_song_locations_create_node(payload: SongLocationNodeCreateRequest) -> dict[str, object]:
    try:
        node = create_song_location_node(
            settings.song_locations_file,
            payload,
            portal_content_file=PORTAL_CONTENT_FILE,
            database_url=settings.database_url,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'node': node,
    }


@app.put('/api/song-locations/nodes/{node_id}')
def api_song_locations_update_node(node_id: str, payload: SongLocationNodeUpdateRequest) -> dict[str, object]:
    try:
        node = update_song_location_node(
            settings.song_locations_file,
            node_id,
            payload,
            portal_content_file=PORTAL_CONTENT_FILE,
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
    }


@app.put('/api/song-locations/nodes/{node_id}/restore')
def api_song_locations_restore_node(node_id: str) -> dict[str, object]:
    try:
        payload = restore_song_location_node(
            settings.song_locations_file,
            node_id,
            portal_content_file=PORTAL_CONTENT_FILE,
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
    }


@app.put('/api/song-locations/reorder')
def api_song_locations_reorder_nodes(payload: SongLocationNodeReorderRequest) -> dict[str, object]:
    try:
        siblings = reorder_song_location_nodes(
            settings.song_locations_file,
            payload,
            portal_content_file=PORTAL_CONTENT_FILE,
            database_url=settings.database_url,
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
def api_song_location_assignments_list() -> dict[str, object]:
    try:
        assignments = list_song_location_assignments(
            settings.song_location_assignments_file,
            database_url=settings.database_url,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'count': len(assignments),
        'assignments': assignments,
    }


@app.post('/api/song-locations/assignments')
def api_song_location_assignments_upsert(payload: SongLocationAssignmentUpsertRequest) -> dict[str, object]:
    try:
        assignment = upsert_song_location_assignment(
            settings.song_location_assignments_file,
            payload,
            favorites_file=settings.song_favorites_file,
            database_url=settings.database_url,
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
def api_song_location_assignments_delete(location_id: str = Query(..., min_length=1)) -> dict[str, object]:
    try:
        removed = delete_song_location_assignment(
            settings.song_location_assignments_file,
            location_id,
            database_url=settings.database_url,
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
            database_url=settings.database_url,
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
            database_url=settings.database_url,
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
            database_url=settings.database_url,
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
def api_custom_songs_list(include_inactive: bool = Query(False)) -> dict[str, object]:
    try:
        songs = list_custom_songs(
            settings.custom_songs_file,
            include_inactive=include_inactive,
            database_url=settings.database_url,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'count': len(songs),
        'songs': songs,
    }


@app.post('/api/songs/custom')
def api_custom_songs_create(payload: CustomSongUpsertRequest) -> dict[str, object]:
    try:
        song = create_custom_song(
            settings.custom_songs_file,
            payload,
            database_url=settings.database_url,
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
def api_custom_songs_reorder(payload: CustomSongReorderRequest) -> dict[str, object]:
    try:
        songs = reorder_custom_songs(
            settings.custom_songs_file,
            payload.ordered_ids,
            database_url=settings.database_url,
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
def api_custom_songs_update(song_id: int, payload: CustomSongUpsertRequest) -> dict[str, object]:
    try:
        song = update_custom_song(
            settings.custom_songs_file,
            song_id,
            payload,
            database_url=settings.database_url,
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
def api_custom_songs_delete(song_id: int) -> dict[str, object]:
    try:
        removed = delete_custom_song(
            settings.custom_songs_file,
            song_id,
            database_url=settings.database_url,
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
def api_custom_songs_restore(song_id: int) -> dict[str, object]:
    try:
        song = restore_custom_song(
            settings.custom_songs_file,
            song_id,
            database_url=settings.database_url,
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
