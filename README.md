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
- `POST /api/songs/favorites` (salva/atualiza favorito em JSON local)
- `DELETE /api/songs/favorites?url=...` (remove favorito pelo link da musica)

## Docker

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
$env:SITE_DOMAIN="app.eaintegrations.com"
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
