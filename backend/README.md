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
   - `POST http://127.0.0.1:8000/api/auth/register` (`name`, `email`, `password`)
   - `POST http://127.0.0.1:8000/api/auth/login` (`email`, `password`)
   - `POST http://127.0.0.1:8000/api/auth/qr/start`
   - `GET http://127.0.0.1:8000/api/auth/qr/status?session_guid=...&poll_token=...`
   - `POST http://127.0.0.1:8000/api/auth/qr/approve` (`session_guid`, `approve_token`, `Authorization: Bearer ...`)
   - `POST http://127.0.0.1:8000/api/auth/qr/complete` (`session_guid`, `poll_token`)
   - `GET http://127.0.0.1:8000/api/auth/me`
   - `PUT http://127.0.0.1:8000/api/auth/me` (`name`, `email`, `password`)
   - `DELETE http://127.0.0.1:8000/api/auth/me`
   - `POST http://127.0.0.1:8000/api/auth/logout`

## Observacoes
- Nesta fase, a API ja possui busca inicial de cifras por nome e leitura de cifra por URL.
- Com `DATABASE_URL` definido, favoritos, musicas manuais e atribuicoes de misterios sao salvos no PostgreSQL.
- Sem `DATABASE_URL`, o fallback local usa `data/song_favorites.json`, `data/custom_songs.json` e `data/mystery_song_assignments.json`.
- Se `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET` estiverem definidos, o backend tenta identificar tom por API quando a cifra nao informar `original_key`.

## Estrutura de banco (PostgreSQL)
- Script inicial: `backend/sql/001_init_auth_schema.sql`
- Tabelas criadas:
  - `app_json_store` (persistencia JSON atual da aplicacao)
  - `app_users` (`user_guid` unico por usuario, `full_name`, `email`, `password_hash`)
  - `app_user_sessions` (controle de sessao/login)
  - `app_auth_qr_sessions` (login por QR com aprovacao do celular)

Aplicar manualmente:

```powershell
psql "$env:DATABASE_URL" -f backend/sql/001_init_auth_schema.sql
```

Se a base ja existir com o schema antigo:

```powershell
psql "$env:DATABASE_URL" -f backend/sql/002_add_auth_qr_sessions.sql
```

## Executar com Docker (hot reload)

Na raiz do projeto:

```powershell
docker compose up --build -d
```

Validar:
- `GET http://127.0.0.1:8000/api/health`
- `GET http://127.0.0.1:8000/api/db/ping`
- `POST http://127.0.0.1:8000/api/auth/register` (`name`, `email`, `password`)
- `POST http://127.0.0.1:8000/api/auth/login` (`email`, `password`)
- `GET http://127.0.0.1:8000/api/auth/me`
- `PUT http://127.0.0.1:8000/api/auth/me` (`name`, `email`, `password`)
- `DELETE http://127.0.0.1:8000/api/auth/me`
- `POST http://127.0.0.1:8000/api/auth/logout`
- `POST http://127.0.0.1:8000/api/songs/search`
- `POST http://127.0.0.1:8000/api/songs/fetch`
- `POST http://127.0.0.1:8000/api/songs/detect-key`
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
