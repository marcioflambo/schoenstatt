from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import PROJECT_DIR, settings
from .db import ping_database
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
    description='Backend inicial para conectividade do portal com PostgreSQL.',
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


@app.get('/api/health')
def api_health() -> dict[str, object]:
    return {
        'status': 'ok',
        'service': 'portal-schoenstatt-api',
        'database_configured': bool(settings.database_url),
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
        'message': 'Conectividade pronta. Criacao de tabelas e CRUD de musicas sera adicionada na proxima etapa.',
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
    file_path = PROJECT_DIR / safe_name

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail='Arquivo nao encontrado')

    return FileResponse(file_path)
