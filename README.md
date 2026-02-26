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

## Docker

Subir o portal (site + API) em modo desenvolvimento (hot reload):

```powershell
docker compose up --build -d
```

Acessos:
- `http://localhost:8000/`
- `http://localhost:8000/api/health`
- `http://localhost:8000/api/db/ping`

Obs.: para mudar a porta externa, defina `PORT_HTTP` antes de subir:

```powershell
$env:PORT_HTTP=8000
docker compose up --build -d
```

Comportamento de atualizacao sem reiniciar:
- Altere arquivos em `index.html`, `assets/*`, `content/*` ou `backend/*`.
- O container reflete automaticamente:
  - frontend: atualize o navegador;
  - backend Python: reinicia sozinho via `uvicorn --reload`.

Parar:

```powershell
docker compose down
```
