# Backend do Portal Schoenstatt

## Requisitos
- Python 3.11+
- Dependencias em `backend/requirements.txt`

## Executar localmente
1. Instalar dependencias:
   ```powershell
   python -m pip install -r backend/requirements.txt
   ```
2. Subir a API:
   ```powershell
   python -m uvicorn backend.app.main:app --reload --port 8000
   ```
3. Validar endpoints:
   - `GET http://127.0.0.1:8000/api/health`
   - `GET http://127.0.0.1:8000/api/db/ping`

## Observacoes
- Nesta fase, a API ja possui busca inicial de cifras por nome e leitura de cifra por URL.
- Favoritos sao salvos localmente em `tmp/song_favorites.json` (ou no caminho definido por `SONG_FAVORITES_FILE`).

## Executar com Docker (hot reload)

Na raiz do projeto:

```powershell
docker compose up --build -d
```

Validar:
- `GET http://127.0.0.1:8000/api/health`
- `GET http://127.0.0.1:8000/api/db/ping`
- `POST http://127.0.0.1:8000/api/songs/search`
- `POST http://127.0.0.1:8000/api/songs/fetch`
- `GET http://127.0.0.1:8000/api/songs/favorites`
- `POST http://127.0.0.1:8000/api/songs/favorites`
- `DELETE http://127.0.0.1:8000/api/songs/favorites?url=...`

Sem reiniciar container:
- alteracoes em `backend/*`: recarregamento automatico da API;
- alteracoes em `index.html`, `assets/*`, `content/*`: refletidas ao atualizar o navegador.

Parar:

```powershell
docker compose down
```
