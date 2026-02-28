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
- Com `DATABASE_URL` definido, favoritos, musicas manuais e atribuicoes de misterios sao salvos no PostgreSQL.
- Sem `DATABASE_URL`, o fallback local usa `data/song_favorites.json`, `data/custom_songs.json` e `data/mystery_song_assignments.json`.

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
- `GET http://127.0.0.1:8000/api/songs/custom`
- `POST http://127.0.0.1:8000/api/songs/custom`
- `PUT http://127.0.0.1:8000/api/songs/custom/{id}`
- `DELETE http://127.0.0.1:8000/api/songs/custom/{id}` (inativa)
- `PUT http://127.0.0.1:8000/api/songs/custom/{id}/restore`

Sem reiniciar container:
- alteracoes em `backend/*`: recarregamento automatico da API;
- alteracoes em `index.html`, `assets/*`, `content/*`: refletidas ao atualizar o navegador.

Parar:

```powershell
docker compose down
```
