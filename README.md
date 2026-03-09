# schoenstatt

Portal do Terço da Mãe Rainha de Schoenstatt.

## Estrutura

- `index.html`: página principal.
- `assets/css/portal.css`: estilo principal.
- `assets/css/vendor/`: estilos de terceiros/legado.
- `assets/js/portal.js`: interações da página.
- `assets/img/`: imagens do portal.
- `content/historia/`: textos da história.
- `content/oracoes/`: textos de orações.
- `content/cantos/`: repertório com letra/cifra.
- `content/misterios/`: meditações dos mistérios.
- `docs/`: documentação do projeto.
- `tmp/`: arquivos temporários (ignorados no Git).
- `data/`: dados persistentes locais (ignorados no Git).

## Backend (conectividade preparada)

- `backend/app/main.py`: API FastAPI com endpoints de health e ping do banco.
- `backend/app/config.py`: leitura de `DATABASE_URL`/`POSTGRES_*`.
- `backend/app/db.py`: validação da conexão PostgreSQL.
- `backend/.env.example`: modelo de variáveis locais.

### Como testar

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --reload --port 8000
```

Endpoints:
- `GET /api/health`
- `GET /api/db/ping`
- `POST /api/auth/register` (campos: `name`, `email`, `password`; retorna `user.guid`)
- `POST /api/auth/login` (campos: `email`, `password`)
- `GET /api/auth/me` (header `Authorization: Bearer <token>`)
- `PUT /api/auth/me` (header `Authorization: Bearer <token>`; campos: `name`, `email`, `password`)
- `DELETE /api/auth/me` (header `Authorization: Bearer <token>`)
- `POST /api/auth/logout` (header `Authorization: Bearer <token>`)
- `POST /api/songs/search` (busca por nome da música em Cifra Club e Cifras)
- `POST /api/songs/fetch` (carrega a cifra pela URL escolhida)
- `GET /api/songs/favorites` (lista músicas favoritadas com cache de letra/cifra)
- `POST /api/songs/favorites` (salva/atualiza favorito em PostgreSQL ou JSON fallback)
- `DELETE /api/songs/favorites?url=...` (remove favorito pelo link da música)
- `GET /api/songs/custom` (lista músicas manuais em PostgreSQL ou JSON fallback)
- `POST /api/songs/custom` (cria música manual em PostgreSQL ou JSON fallback)
- `PUT /api/songs/custom/{id}` (atualiza música manual)
- `DELETE /api/songs/custom/{id}` (exclui música manual)

## Docker (local)

Subir o portal (site + API) com proxy HTTPS (Caddy + certificado válido):

```powershell
docker compose up --build -d
```

Acessos:
- `http://localhost:80/`
- `https://localhost:443/`
- `https://localhost/api/health`
- `https://localhost/api/db/ping`

Portas padrao para evitar conflito com outros containers no host:
- `PORT_HTTP_ALT=80`
- `PORT_HTTPS_ALT=443`
- `LOCAL_POSTGRES_PORT=5432`
- `LOCAL_POSTGRES_VOLUME_NAME=shoenstatt_postgres_data`
- `LOCAL_CADDY_DATA_VOLUME_NAME=shoenstatt_caddy_data`
- `LOCAL_CADDY_CONFIG_VOLUME_NAME=shoenstatt_caddy_config`

Banco local isolado do ambiente do host:
- este compose usa `LOCAL_DATABASE_URL` (nao `DATABASE_URL`) para evitar herdar conexoes de outro projeto;
- default: `postgresql://schoenstatt:schoenstatt@postgres:5432/schoenstatt?sslmode=disable`.

Para rodar multiplas stacks Compose em paralelo, defina um nome de projeto diferente:

```powershell
$env:COMPOSE_PROJECT_NAME="schoenstatt_b"
docker compose up --build -d
```

Para usar certificado público (sem aviso de "inseguro"), defina o domínio:

```powershell
$env:SITE_DOMAIN="maerainhavencedora.com.br"
docker compose up --build -d
```

Obs.: para mudar as portas externas, defina `PORT_HTTP_ALT` e/ou `PORT_HTTPS_ALT` antes de subir:

```powershell
$env:PORT_HTTP_ALT=8080
$env:PORT_HTTPS_ALT=8443
docker compose up --build -d
```

Requisitos para certificado válido do Let's Encrypt:
- o DNS de `SITE_DOMAIN` deve apontar para este servidor;
- portas `80` e `443` precisam estar abertas/públicas no host (se precisar disso, ajuste `PORT_HTTP_ALT=80` e `PORT_HTTPS_ALT=443`).

Comportamento de atualização sem reiniciar:
- Altere arquivos em `index.html`, `assets/*`, `content/*` ou `backend/*`.
- O container reflete automaticamente:
  - frontend: atualize o navegador;
  - backend Python: reinicia sozinho via `uvicorn --reload`.

Parar:

```powershell
docker compose down
```

## Docker (Hostinger - 1 container)

Fluxo alinhado com o Docker Manager (Deploy your first container):

```powershell
Copy-Item .env.hostinger.example .env.hostinger
# Ajuste DATABASE_URL, CORS_ALLOW_ORIGINS, APP_PORT
# Opcional: SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET (fallback de tom)
```

1. No hPanel: `VPS -> Docker Manager -> Create project -> Compose`.
2. Em `Project URL`, informe o repositório: `https://github.com/marcioflambo/schoenstatt.git`.
3. Em `Docker compose file`, use `docker-compose.hostinger.yml`.
4. Na aba `Ambiente`, adicione as variáveis de `.env.hostinger`.
5. Clique em `Deploy`.

Validação após deploy:
- `http://IP_DA_VPS:8000/api/health`
- `http://IP_DA_VPS:8000/api/db/ping`
- confirme em `/api/health` que `songs_storage_backend` está como `postgresql`
- opcional: confirme `song_key_api_configured: true` em `/api/health` quando configurar Spotify

Para domínio `maerainhavencedora.com.br` com HTTPS, configure o proxy reverso da Hostinger apontando para a porta `8000` do container.
