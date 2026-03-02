# schoenstatt

Portal do Terco da Mae Rainha de Schoenstatt.

## Estrutura

- `index.html`: pagina principal.
- `assets/css/portal.css`: estilo principal.
- `assets/css/vendor/`: estilos de terceiros/legado.
- `assets/js/portal.js`: interacoes da pagina.
- `assets/img/`: imagens do portal.
- `content/historia/`: textos da historia.
- `content/oracoes/`: textos de oracoes.
- `content/cantos/`: repertorio com letra/cifra.
- `content/misterios/`: meditacoes dos misterios.
- `docs/`: documentacao do projeto.
- `tmp/`: arquivos temporarios (ignorados no Git).
- `data/`: dados persistentes locais (ignorados no Git).

## Backend (conectividade preparada)

- `backend/app/main.py`: API FastAPI com endpoints de health e ping do banco.
- `backend/app/config.py`: leitura de `DATABASE_URL`/`POSTGRES_*`.
- `backend/app/db.py`: validacao da conexao PostgreSQL.
- `backend/.env.example`: modelo de variaveis locais.

### Como testar

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --reload --port 8000
```

Endpoints:
- `GET /api/health`
- `GET /api/db/ping`
- `POST /api/songs/search` (busca por nome da musica em Cifra Club e Cifras)
- `POST /api/songs/fetch` (carrega a cifra pela URL escolhida)
- `GET /api/songs/favorites` (lista musicas favoritadas com cache de letra/cifra)
- `POST /api/songs/favorites` (salva/atualiza favorito em PostgreSQL ou JSON fallback)
- `DELETE /api/songs/favorites?url=...` (remove favorito pelo link da musica)
- `GET /api/songs/custom` (lista musicas manuais em PostgreSQL ou JSON fallback)
- `POST /api/songs/custom` (cria musica manual em PostgreSQL ou JSON fallback)
- `PUT /api/songs/custom/{id}` (atualiza musica manual)
- `DELETE /api/songs/custom/{id}` (inativa musica manual)
- `PUT /api/songs/custom/{id}/restore` (reativa musica manual inativada)

## Docker (local)

Subir o portal (site + API) com proxy HTTPS (Caddy + certificado valido):

```powershell
docker compose up --build -d
```

Acessos:
- `http://localhost:80/`
- `https://localhost:443/`
- `https://localhost/api/health`
- `https://localhost/api/db/ping`

Para usar certificado publico (sem aviso de "inseguro"), defina o dominio:

```powershell
$env:SITE_DOMAIN="maerainhavencedora.com.br"
docker compose up --build -d
```

Obs.: para mudar as portas externas, defina `PORT_HTTP_ALT` e/ou `PORT_HTTPS_ALT` antes de subir:

```powershell
$env:PORT_HTTP_ALT=80
$env:PORT_HTTPS_ALT=443
docker compose up --build -d
```

Requisitos para certificado valido do Let's Encrypt:
- o DNS de `SITE_DOMAIN` deve apontar para este servidor;
- portas `80` e `443` precisam estar abertas/publicas no host.

Comportamento de atualizacao sem reiniciar:
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
2. Em `Project URL`, informe o repositorio: `https://github.com/marcioflambo/schoenstatt.git`.
3. Em `Docker compose file`, use `docker-compose.hostinger.yml`.
4. Na aba `Ambiente`, adicione as variaveis de `.env.hostinger`.
5. Clique em `Deploy`.

Validacao apos deploy:
- `http://IP_DA_VPS:8000/api/health`
- `http://IP_DA_VPS:8000/api/db/ping`
- confirme em `/api/health` que `songs_storage_backend` esta como `postgresql`
- opcional: confirme `song_key_api_configured: true` em `/api/health` quando configurar Spotify

Para dominio `maerainhavencedora.com.br` com HTTPS, configure o proxy reverso da Hostinger apontando para a porta `8000` do container.
