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
- Tabelas e CRUD de musicas/oracoes serao criados na proxima etapa.

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

Sem reiniciar container:
- alteracoes em `backend/*`: recarregamento automatico da API;
- alteracoes em `index.html`, `assets/*`, `content/*`: refletidas ao atualizar o navegador.

Parar:

```powershell
docker compose down
```
