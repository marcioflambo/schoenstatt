from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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
from .song_favorites import (
    SongFavoriteCreateRequest,
    SongFavoriteReorderRequest,
    delete_song_favorite,
    list_song_favorites,
    reorder_song_favorites,
    save_song_favorite,
)
from .songs import (
    SongFetchRequest,
    SongLyricsFetchRequest,
    SongSearchRequest,
    fetch_lyrics_from_letras,
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


@app.get('/api/health')
def api_health() -> dict[str, object]:
    return {
        'status': 'ok',
        'service': 'portal-schoenstatt-api',
        'database_configured': bool(settings.database_url),
        'songs_storage_backend': 'postgresql' if settings.database_url else 'json',
        'song_favorites_store': str(settings.song_favorites_file),
        'custom_songs_store': str(settings.custom_songs_file),
        'mystery_song_assignments_store': str(settings.mystery_song_assignments_file),
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


@app.post('/api/songs/search')
def api_song_search(payload: SongSearchRequest) -> dict[str, object]:
    try:
        results = search_song_portals(payload.query, payload.limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail={'message': str(exc)}) from exc

    return {
        'ok': True,
        'query': payload.query.strip(),
        'count': len(results),
        'results': results,
    }


@app.post('/api/songs/fetch-lyrics')
def api_song_fetch_lyrics(payload: SongLyricsFetchRequest) -> dict[str, object]:
    try:
        song = fetch_lyrics_from_letras(payload.title, payload.artist, payload.source_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={'message': str(exc)}) from exc
    except RuntimeError as exc:
        message = str(exc)
        if message in {
            'Nao foi possivel carregar a letra no Letras.mus.br para esta musica.',
            'Nao foi possivel identificar a letra nesta pagina do Letras.mus.br.',
        }:
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


@app.get('/{file_name}', include_in_schema=False)
def top_level_files(file_name: str) -> FileResponse:
    safe_name = Path(file_name).name
    if safe_name not in ROOT_PUBLIC_FILES:
        raise HTTPException(status_code=404, detail='Arquivo nao encontrado')

    file_path = PROJECT_DIR / safe_name

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail='Arquivo nao encontrado')

    return FileResponse(file_path)
