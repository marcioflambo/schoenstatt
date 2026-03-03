# Cloud Architecture Notes - Schoenstatt

Atualizado em: 2026-03-03

## 1) Visao geral da arquitetura

Arquitetura atual (local e producao):

```
Browser (Portal + Admin)
  -> Caddy (TLS, reverse proxy, 80/443)
    -> FastAPI/Uvicorn container (porta 8000)
      -> Camada de servicos Python (songs, favorites, custom, locations, assignments)
        -> Persistencia:
           a) PostgreSQL (preferencial, tabela app_json_store)
           b) JSON em disco (fallback em /data)
      -> Integracoes externas:
           - Cifra Club / Cifras (busca e cifra)
           - Spotify API (detectar tom)
```

Decisoes-chave:
- O frontend e servido pelo proprio backend FastAPI (`/`, `/assets/*`, `/admin`).
- O backend usa um modelo "JSON store" com opcao de salvar em PostgreSQL JSONB.
- Sem `DATABASE_URL`, a aplicacao funciona com arquivos locais em `data/*.json`.
- Conteudo textual de runtime do portal esta centralizado em `assets/data/portal-content.json`.
- `content/*.md` permanece no repositorio como material editorial/legado, nao como fonte primaria renderizada em runtime.

## 2) Stack tecnologico completo

Aplicacao:
- Frontend: HTML5 + CSS3 + JavaScript vanilla.
- Arquivos principais frontend:
- `index.html`
- `assets/css/portal.css`
- `assets/js/portal.js`
- `admin-song-locations.html`
- `assets/css/admin-song-locations.css`
- `assets/js/admin-song-locations.js`

Backend:
- Python 3.12
- FastAPI
- Uvicorn (`uvicorn[standard]`)
- Pydantic
- psycopg 3 (`psycopg[binary]`)
- python-dotenv

Dados e armazenamento:
- PostgreSQL 16 (imagem `postgres:16-alpine`)
- JSONB em tabela `app_json_store`
- Fallback local em JSON (`data/song_favorites.json`, `data/custom_songs.json`, etc.)

Infra e entrega:
- Docker + Docker Compose
- Caddy 2.8.4 (proxy reverso + TLS)
- Deploy Hostinger (compose single-container para app ou stack completa local)

Observabilidade e operacao:
- Healthcheck API: `GET /api/health`
- Ping banco: `GET /api/db/ping`
- Logs do Uvicorn + logs de persistencia JSON store

## 3) Todas as variaveis de ambiente

### Backend/aplicacao

| Variavel | Obrigatoria | Default | Uso |
|---|---|---|---|
| `DATABASE_URL` | Nao | vazio | URL direta do PostgreSQL (prioritaria) |
| `POSTGRES_HOST` | Nao | vazio | Montagem da URL quando `DATABASE_URL` nao existe |
| `POSTGRES_PORT` | Nao | `5432` | Idem acima |
| `POSTGRES_USER` | Nao | vazio | Idem acima |
| `POSTGRES_PASSWORD` | Nao | vazio | Idem acima |
| `POSTGRES_DB` | Nao | vazio | Idem acima |
| `CORS_ALLOW_ORIGINS` | Nao | `*` | CORS do FastAPI |
| `SONG_FAVORITES_FILE` | Nao | `data/song_favorites.json` | Fallback de favoritos |
| `CUSTOM_SONGS_FILE` | Nao | `data/custom_songs.json` | Fallback de musicas manuais |
| `MYSTERY_SONG_ASSIGNMENTS_FILE` | Nao | `data/mystery_song_assignments.json` | Fallback de vinculos por misterio |
| `SONG_LOCATIONS_FILE` | Nao | `data/song_locations.json` | Fallback de arvore de locais |
| `SONG_LOCATION_ASSIGNMENTS_FILE` | Nao | `data/song_location_assignments.json` | Fallback de vinculos por local |
| `SONG_LOCATION_DELETE_PASSWORD` | Sim (operacional) | `FL@MB0` | Protege inativacao/exclusao de locais |
| `SPOTIFY_CLIENT_ID` | Nao | vazio | Autenticacao Spotify para detectar tom |
| `SPOTIFY_CLIENT_SECRET` | Nao | vazio | Autenticacao Spotify para detectar tom |

### Docker Compose (local)

| Variavel | Obrigatoria | Default | Uso |
|---|---|---|---|
| `LOCAL_POSTGRES_DB` | Nao | `schoenstatt` | Banco do container Postgres local |
| `LOCAL_POSTGRES_USER` | Nao | `schoenstatt` | Usuario do Postgres local |
| `LOCAL_POSTGRES_PASSWORD` | Nao | `schoenstatt` | Senha do Postgres local |
| `LOCAL_POSTGRES_PORT` | Nao | `5432` | Porta exposta do Postgres local |
| `DATABASE_URL` | Nao | URL local do compose | Conexao da API ao Postgres |
| `SITE_DOMAIN` | Nao | `maerainhavencedora.com.br` | Dominio primario no Caddy |
| `PORT_HTTP_ALT` | Nao | `80` | Porta HTTP externa do proxy |
| `PORT_HTTPS_ALT` | Nao | `443` | Porta HTTPS externa do proxy |

### Caddy

| Variavel | Obrigatoria | Default | Uso |
|---|---|---|---|
| `SITE_DOMAIN` | Nao | `maerainhavencedora.com.br` | Host principal |
| `SITE_DOMAIN_WWW` | Nao | `www.maerainhavencedora.com.br` | Host alternativo |
| `SITE_DOMAIN_APP` | Nao | `app.maerainhavencedora.com.br` | Host alternativo/app |

### Hostinger compose

| Variavel | Obrigatoria | Default | Uso |
|---|---|---|---|
| `APP_PORT` | Nao | `8000` | Porta externa do container app |
| `DATABASE_URL` | Recomendado | vazio | Persistencia PostgreSQL |
| `CORS_ALLOW_ORIGINS` | Recomendado | dominios oficiais | CORS |
| `SPOTIFY_CLIENT_ID` | Nao | vazio | Detectar tom por API |
| `SPOTIFY_CLIENT_SECRET` | Nao | vazio | Detectar tom por API |
| `SONG_LOCATION_DELETE_PASSWORD` | Sim (operacional) | `FL@MB0` | Senha administrativa |

### Variaveis internas de runtime (container)

| Variavel | Origem | Uso |
|---|---|---|
| `PORT` | Dockerfile | Porta usada no comando default do Uvicorn |
| `WATCHFILES_FORCE_POLLING` | docker-compose local | Hot reload mais estavel em volume montado |
| `PYTHONDONTWRITEBYTECODE` | Dockerfile | Evita `.pyc` em runtime |
| `PYTHONUNBUFFERED` | Dockerfile | Log em tempo real |

## 4) Estrutura do diretorio de conteudo

Fonte de conteudo ativa no portal:

```
assets/
  data/
    portal-content.json
```

Chaves de alto nivel em `portal-content.json`:
- `meta`
- `brand`
- `menu`
- `hero`
- `historia`
- `roteiro`
- `misterios`
- `cantos`
- `oracoes`
- `santuarios`
- `sementes`
- `recursos`
- `footer`
- `uiMessages`

Conteudo editorial/legado mantido no repo:

```
content/
  historia/capitulos.md
  oracoes/base.md
  cantos/repertorio.md
  misterios/meditacoes.md
```

Persistencia gerada em runtime (nao versionada):

```
data/
  song_favorites.json
  custom_songs.json
  mystery_song_assignments.json
  song_locations.json
  song_location_assignments.json
```

## 5) Servicos, jobs e models de cada app

### App: `backend.app.main` (API gateway)
- Services:
- Exposicao de endpoints REST para health, songs, favorites, custom songs, locations e admin.
- Sincronizacao de `usage_locations` de favoritos em tempo de leitura (`GET /api/songs/favorites`).
- Jobs:
- Job sincronico em request: recalcular e persistir `usage_locations` quando divergente.
- Models:
- `AdminLoginRequest`

### App: `backend.app.songs`
- Services:
- Busca em portais (`search_song_portals`).
- Fetch de cifra por URL (`fetch_song_from_url`).
- Extracao de letra limpa (`extract_plain_lyrics_from_chords_text`, `fetch_lyrics_from_chords`).
- Deteccao de tom via Spotify (`detect_song_key`, `detect_song_key_with_api`).
- Jobs:
- Cache em memoria de token Spotify (`_SPOTIFY_TOKEN_CACHE`) e de tom detectado (`_DETECTED_KEY_CACHE`).
- Sem agendador externo (cron/celery inexistente).
- Models:
- `SongFetchRequest`
- `SongLyricsFetchRequest`
- `SongSearchRequest`
- `SongKeyDetectRequest`

### App: `backend.app.song_favorites`
- Services:
- CRUD de favoritos, reordenacao e atualizacao de uso.
- Upsert idempotente por URL normalizada.
- Prefetch opcional de cifra ao salvar.
- Jobs:
- Upsert transacional com lock em memoria (`RLock`) e mutate atomico no banco (`mutate_store`).
- Geracao automatica de URLs externas (Spotify/YouTube) quando ausentes.
- Models:
- Request models: `SongFavoriteCreateRequest`, `SongFavoriteReorderRequest`
- Store model `favorites[]`:
- `id`, `song_url`, `title`, `artist`, `source`, `source_label`, `image_url`
- `spotify_url`, `youtube_url`
- `lyrics_source`, `lyrics_source_url`, `lyrics_text`
- `chords_source`, `chords_source_url`, `chords_original_key`, `chords_selected_key`, `chords_text`
- `usage_locations`, `order_index`, `created_at_utc`, `updated_at_utc`

### App: `backend.app.custom_songs`
- Services:
- CRUD de musicas manuais, soft delete/restore e reorder.
- Jobs:
- Backfill de `order_index` e ordenacao estavel por `order_index` + recencia.
- Models:
- Request models: `CustomSongUpsertRequest`, `CustomSongReorderRequest`
- Store model `songs[]`:
- `id`, `title`, `key`, `lyrics_text`, `chords_text`, `order_index`
- `is_active`, `created_at_utc`, `updated_at_utc`, `deleted_at_utc`

### App: `backend.app.mystery_song_assignments`
- Services:
- Upsert/list/delete de musica por misterio.
- Sincronizacao opcional com favoritos apos upsert.
- Jobs:
- Deduplicacao por `assignment_key`.
- Normalizacao/canonizacao de chaves de grupo e misterio.
- Models:
- Request model: `MysterySongAssignmentUpsertRequest`
- Store model `assignments[]`:
- `assignment_key`, `group_key`, `group_title`, `group_day`, `mystery_key`, `mystery_title`
- `song_title`, `song_artist`, `song_url`, `source`, `source_label`, `image_url`
- `lyrics_text`, `lyrics_source`, `lyrics_source_url`
- `created_at_utc`, `updated_at_utc`

### App: `backend.app.song_locations`
- Services:
- Arvore de locais: list/create/update/reorder.
- Soft delete, restore e hard delete recursivo.
- Bootstrap/default tree a partir de `portal-content.json`.
- Jobs:
- Backfill automatico de arvore legada minima.
- Reindexacao de `order_index` entre irmaos apos mudancas.
- Models:
- Request models:
- `SongLocationNodeCreateRequest`
- `SongLocationNodeUpdateRequest`
- `SongLocationNodeReorderRequest`
- Store model `nodes[]`:
- `node_id`, `parent_id`, `label`, `order_index`
- `assignment_mode` (`location` ou `mystery`)
- `mystery_group_title`, `mystery_title`
- `is_active`, `deleted_at_utc`, `created_at_utc`, `updated_at_utc`

### App: `backend.app.song_location_assignments`
- Services:
- Upsert/list/delete de musica por local.
- Delete em lote por `location_id` (usado no hard delete admin).
- Sincronizacao opcional com favoritos apos upsert.
- Jobs:
- Deduplicacao por `location_id`.
- Ordenacao por caminho (`location_path`) para retorno estavel.
- Models:
- Request model: `SongLocationAssignmentUpsertRequest`
- Store model `assignments[]`:
- `assignment_key`, `location_id`, `location_label`, `location_path`
- `song_title`, `song_artist`, `song_url`, `source`, `source_label`, `image_url`
- `lyrics_text`, `lyrics_source`, `lyrics_source_url`
- `created_at_utc`, `updated_at_utc`

### App: `backend.app.json_store_db`
- Services:
- `load_store`, `save_store`, `mutate_store` em `app_json_store`.
- Jobs:
- Criacao lazy da tabela (`CREATE TABLE IF NOT EXISTS`) em cada ciclo de acesso.
- Lock transacional com `SELECT ... FOR UPDATE` no mutate.
- Models:
- Tabela `app_json_store(store_key TEXT PK, payload JSONB, updated_at TIMESTAMPTZ)`

### App: `backend.app.db`
- Services:
- `ping_database` para validacao de conectividade.
- Jobs:
- Nao possui jobs.
- Models:
- Payload de resposta de health de banco (`ok`, `message`, `database`, `server_time_utc`, `checked_at_utc`).

### App: Frontend Portal (`assets/js/portal.js`)
- Services:
- Renderizacao da experiencia principal do terco e modais.
- Consumo da API de songs/favorites/custom/mysteries/locations.
- Persistencia local de preferencias (`localStorage`).
- Jobs:
- Autosave periodico de rascunho de musica custom (`setInterval`).
- Debounce de busca e sincronizacoes visuais (`setTimeout`/`requestAnimationFrame`).
- Models:
- Modelo de conteudo lido de `portal-content.json`.
- Estruturas de UI para favoritos, musicas custom, arvore de locais e assignments.

### App: Frontend Admin (`assets/js/admin-song-locations.js`)
- Services:
- Login administrativo, leitura de arvore e exclusao definitiva de nodes.
- Jobs:
- Restauracao de sessao curta em `sessionStorage`.
- Models:
- Modelo simplificado de node (`id`, `label`, `children[]`) para render da arvore.

## 6) 12 common hurdles com solucoes documentadas

| # | Hurdle | Sintoma | Solucao pratica |
|---|---|---|---|
| 1 | `DATABASE_URL` ausente | dados "somem" ao recriar container | Definir `DATABASE_URL` valido ou montar volume persistente para `data/` |
| 2 | CORS incorreto | frontend bloqueado por navegador | Ajustar `CORS_ALLOW_ORIGINS` com dominio exato |
| 3 | Spotify sem credenciais | tom original vazio | Preencher `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET` |
| 4 | URL de musica invalida | erro 400 ao favoritar | Usar URL de `cifraclub` ou `cifras` suportada |
| 5 | JSON corrompido | erro 500 de leitura de store | Restaurar JSON valido ou migrar para PostgreSQL |
| 6 | Ordem inconsistente | itens mudam de posicao apos salvar | Reaplicar endpoint de reorder para gerar `order_index` coerente |
| 7 | Duplicidade de vinculos | labels de uso repetidas | Normalizacao ja deduplica; revisar dados antigos e resalvar |
| 8 | Senha admin divergente | 403 no admin/delete | Unificar `SONG_LOCATION_DELETE_PASSWORD` entre ambiente e cliente |
| 9 | Hard delete deixa lixo | assignment de local antigo permanece | Endpoint admin ja chama cleanup em lote; validar retorno `assignment_cleanup` |
|10| TLS nao sobe | HTTPS invalido no dominio | Confirmar DNS apontando para host + portas 80/443 abertas |
|11| Hostinger rota errada | app nao responde no dominio | Garantir proxy para `APP_PORT` correto (default 8000) |
|12| Conteudo fora do JSON | textos divergentes entre telas | Manter `assets/data/portal-content.json` como fonte unica e eliminar fallback hardcoded |

## 7) 14 design patterns do projeto

1. Composition Root: `main.py` concentra wiring de rotas e dependencias.
2. Settings Object: `Settings` dataclass em `config.py` centraliza configuracao.
3. Adapter Pattern: adaptadores para Cifra Club, Cifras e Spotify.
4. Facade API: endpoints REST escondem complexidade interna dos modulos.
5. Repository-like Store: cada dominio expoe funcoes de leitura/escrita do store.
6. Store Strategy (DB vs File): alternancia por configuracao (`DATABASE_URL`).
7. Upsert Idempotente: saves por chave canonica (URL/location/assignment_key).
8. Canonicalization Pipeline: normalizacao de strings/chaves antes de persistir.
9. Soft Delete + Restore: preserva historico e permite rollback funcional.
10. Hard Delete Cascade: exclusao definitiva com limpeza de dependencias.
11. Deterministic Ordering: `order_index` + tie-breakers para retorno estavel.
12. In-memory Cache: cache de token Spotify e tons detectados.
13. Transactional Mutation: `mutate_store` com lock SQL (`FOR UPDATE`).
14. Progressive Enhancement UI: HTML base + hidratacao por JSON/API no JS.

## 8) Pipeline semanal completo com horarios

Timezone sugerido: Europe/Lisbon.

| Dia | Horario | Etapa | Saida esperada |
|---|---|---|---|
| Segunda | 09:00-10:00 | Triagem de backlog e bugs | backlog priorizado da semana |
| Segunda | 10:00-12:00 | Planejamento tecnico | escopo fechado + riscos |
| Segunda | 14:00-18:00 | Implementacao lote A | PRs abertas com testes locais |
| Terca | 09:00-12:30 | Implementacao lote B | features centrais concluidas |
| Terca | 14:00-16:00 | Revisao cruzada de codigo | feedback aplicado |
| Terca | 16:00-18:00 | Ajustes de review | PRs prontas para merge |
| Quarta | 09:00-11:00 | Integracao e regressao funcional | smoke test completo |
| Quarta | 11:00-12:00 | Auditoria de conteudo JSON | consistencia textual validada |
| Quarta | 14:00-18:00 | Hardening (erro/log/perf) | build candidato |
| Quinta | 09:00-11:00 | Testes de deploy (staging) | checklist de deploy verde |
| Quinta | 11:00-12:00 | Revisao de variaveis e segredos | env alinhado por ambiente |
| Quinta | 14:00-17:00 | Janela de release | versao publicada |
| Quinta | 17:00-18:00 | Validacao pos-release | health e fluxos criticos ok |
| Sexta | 09:00-10:30 | Observabilidade e incidentes | pendencias operacionais listadas |
| Sexta | 10:30-12:00 | Limpeza tecnica/refatoracoes curtas | divida tecnica reduzida |
| Sexta | 14:00-16:00 | Documentacao (`cloud.md`, runbooks) | docs atualizados |
| Sexta | 16:00-17:00 | Retro semanal | acoes da proxima semana |
| Sabado | 10:00-10:30 | Check de health rapido | status de fim de semana |
| Domingo | 18:00-18:30 | Preflight da semana seguinte | ambiente pronto para segunda |

## 9) Checklist pos-implementacao

- `docker compose up --build -d` executa sem erro.
- `GET /api/health` retorna `status=ok`.
- `GET /api/db/ping` responde com `ok=true` (quando DB habilitado).
- `songs_storage_backend` confere com o ambiente esperado (json/postgresql).
- CORS validado no dominio real.
- `portal-content.json` sem chaves quebradas e sem texto duplicado.
- Busca de musica (`/api/songs/search`) retorna resultados.
- Fetch de cifra (`/api/songs/fetch`) funcional com URL valida.
- Favoritos: criar, listar, remover e reordenar funcionando.
- Musicas custom: criar, editar, inativar, restaurar e reordenar funcionando.
- Vinculos por misterio: upsert/list/delete funcionando.
- Arvore de locais: create/update/reorder/delete/restore funcionando.
- Hard delete admin remove tambem assignments relacionados.
- Modal e navegacao por ancora sem colidir com header fixo.
- Fluxo mobile testado (menu, modais, scroll, teclado).
- Logs sem erro recorrente apos 15 min de uso real.
- Senha administrativa nao exposta em frontend persistente longo.
- Backup de `data/*.json` (se fallback) ou dump do PostgreSQL executado.
- Documentacao atualizada (README + `cloud.md`) apos merge.

