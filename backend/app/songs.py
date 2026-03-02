from __future__ import annotations

import base64
import json
import os
import re
import time
import unicodedata
from html import unescape
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus, urlparse, urlunparse
from urllib.request import Request, urlopen

from pydantic import BaseModel

CIFRACLUB_HOST_SUFFIXES = ('cifraclub.com.br', 'cifraclub.com')
CIFRAS_HOST_SUFFIXES = ('cifras.com.br',)
_CHORD_TOKEN_PATTERN = re.compile(r'\[[^\]\n]+\]')
_SPOTIFY_KEY_NOTES_SHARP = ('C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B')
_SPOTIFY_TOKEN_CACHE: dict[str, object] = {
    'access_token': '',
    'expires_at': 0.0,
}
_DETECTED_KEY_CACHE: dict[str, str] = {}
_SONG_TITLE_VARIATION_TOKENS = {
    'acustica',
    'acustico',
    'acoustic',
    'cover',
    'instrumental',
    'karaoke',
    'live',
    'oficial',
    'playback',
    'remaster',
    'remastered',
    'simplificada',
    'simplificado',
    'tablatura',
    'tutorial',
    'versao',
    'version',
    'videoaula',
    'vivo',
}
_SONG_ARTIST_SPLIT_TOKENS = ('feat', 'featuring', 'ft', 'part', 'participacao', 'with')


class SongFetchRequest(BaseModel):
    url: str


class SongLyricsFetchRequest(BaseModel):
    title: str = ''
    artist: str = ''
    source_url: str = ''


class SongSearchRequest(BaseModel):
    query: str
    limit: int = 18
    page: int = 1
    page_size: int | None = None


class SongKeyDetectRequest(BaseModel):
    title: str
    artist: str = ''


def _log_external_url(url: str) -> None:
    safe_url = (url or '').strip()
    if not safe_url:
        return
    print(f'[external-request] GET {safe_url}', flush=True)


def _normalize_spaces(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip()


def _canonical_note(note: str) -> str:
    if not note:
        return note
    note = note.strip()
    if len(note) == 1:
        return note.upper()
    return note[0].upper() + note[1:]


def _normalize_lyrics_text(text: str) -> str:
    normalized_breaks = text.replace('\r\n', '\n').replace('\r', '\n')
    lines = [line.rstrip() for line in normalized_breaks.split('\n')]
    normalized: list[str] = []
    blank_streak = 0

    for line in lines:
        if not line.strip():
            blank_streak += 1
            if blank_streak <= 2:
                normalized.append('')
            continue

        blank_streak = 0
        normalized.append(line)

    return '\n'.join(normalized).strip()


def _parse_song_source(hostname: str) -> str | None:
    if any(hostname.endswith(suffix) for suffix in CIFRACLUB_HOST_SUFFIXES):
        return 'cifraclub'
    if any(hostname.endswith(suffix) for suffix in CIFRAS_HOST_SUFFIXES):
        return 'cifras'
    return None


def _normalize_song_url(raw_url: str) -> tuple[str, str]:
    raw_url = (raw_url or '').strip()
    if not raw_url:
        raise ValueError('Informe um link de musica.')

    if '://' not in raw_url:
        raw_url = f'https://{raw_url}'

    parsed = urlparse(raw_url)
    if parsed.scheme not in ('http', 'https'):
        raise ValueError('Link invalido. Use http ou https.')

    hostname = (parsed.hostname or '').lower()
    source = _parse_song_source(hostname)
    if source not in {'cifraclub', 'cifras'}:
        raise ValueError('A busca automatica aceita links do Cifra Club e do Cifras.com.br.')

    if not parsed.path or parsed.path == '/':
        raise ValueError('Link de musica invalido.')

    clean_path = parsed.path
    if source == 'cifraclub' and not clean_path.endswith('/'):
        clean_path = f'{clean_path}/'

    normalized = parsed._replace(
        netloc=hostname,
        path=clean_path,
        params='',
        query='',
        fragment='',
    )
    return urlunparse(normalized), source


def _download_text(url: str) -> str:
    _log_external_url(url)
    request = Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/123.0 Safari/537.36',
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
        },
    )

    try:
        with urlopen(request, timeout=16) as response:
            content = response.read()
            header_charset = response.headers.get_content_charset()
            content_type = (response.headers.get_content_type() or '').lower()

        meta_match = re.search(rb'charset=["\']?([a-zA-Z0-9_-]+)', content[:4096], flags=re.IGNORECASE)
        meta_charset = meta_match.group(1).decode('ascii', errors='ignore') if meta_match else None

        preferred_charsets: list[str] = []
        if 'json' in content_type:
            preferred_charsets.append('utf-8')

        tried: set[str] = set()
        for charset in (*preferred_charsets, meta_charset, header_charset, 'utf-8', 'latin-1'):
            if not charset:
                continue
            normalized_charset = charset.lower()
            if normalized_charset in tried:
                continue
            tried.add(normalized_charset)
            try:
                return content.decode(normalized_charset)
            except UnicodeDecodeError:
                continue

        return content.decode('utf-8', errors='replace')
    except Exception as exc:
        raise RuntimeError(f'Falha ao carregar a pagina da cifra: {exc}') from exc


def _download_json(url: str) -> dict:
    text = _download_text(url).strip()
    if text.startswith('(') and text.endswith(')'):
        text = text[1:-1]

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'Resposta invalida do portal de busca: {exc}') from exc

    if not isinstance(payload, dict):
        raise RuntimeError('Resposta inesperada do portal de busca.')

    return payload


def _log_song_key_event(message: str) -> None:
    safe_message = _normalize_spaces(message or '')
    if not safe_message:
        return
    print(f'[song-key] {safe_message}', flush=True)


def _download_json_request(
    url: str,
    *,
    method: str = 'GET',
    headers: dict[str, str] | None = None,
    data: bytes | None = None,
) -> dict:
    request = Request(
        url,
        data=data,
        method=method,
        headers=headers or {},
    )
    _log_external_url(url)

    try:
        with urlopen(request, timeout=16) as response:
            content = response.read()
            charset = response.headers.get_content_charset() or 'utf-8'
    except HTTPError as exc:
        detail = ''
        try:
            detail = exc.read().decode('utf-8', errors='replace')
        except Exception:
            detail = ''
        detail = _normalize_spaces(detail)[:220]
        raise RuntimeError(f'Requisicao HTTP {exc.code} falhou para servico de tom: {detail}') from exc
    except URLError as exc:
        raise RuntimeError(f'Falha de rede ao consultar servico de tom: {exc.reason}') from exc
    except Exception as exc:
        raise RuntimeError(f'Falha ao consultar servico de tom: {exc}') from exc

    try:
        text = content.decode(charset, errors='replace')
        payload = json.loads(text)
    except Exception as exc:
        raise RuntimeError(f'Resposta invalida do servico de tom: {exc}') from exc

    if not isinstance(payload, dict):
        raise RuntimeError('Resposta inesperada do servico de tom.')
    return payload


def _read_spotify_credentials() -> tuple[str, str]:
    client_id = _normalize_spaces(os.getenv('SPOTIFY_CLIENT_ID', ''))
    client_secret = _normalize_spaces(os.getenv('SPOTIFY_CLIENT_SECRET', ''))
    return client_id, client_secret


def _read_cached_spotify_token() -> str:
    token = str(_SPOTIFY_TOKEN_CACHE.get('access_token') or '')
    expires_at = float(_SPOTIFY_TOKEN_CACHE.get('expires_at') or 0.0)
    if not token:
        return ''
    # Keep a small safety margin before expiry.
    if time.time() >= max(0.0, expires_at - 20):
        return ''
    return token


def _cache_spotify_token(access_token: str, expires_in_seconds: int) -> None:
    safe_token = _normalize_spaces(access_token)
    if not safe_token:
        return
    try:
        ttl = int(expires_in_seconds)
    except (TypeError, ValueError):
        ttl = 0
    if ttl <= 0:
        ttl = 3600
    _SPOTIFY_TOKEN_CACHE['access_token'] = safe_token
    _SPOTIFY_TOKEN_CACHE['expires_at'] = time.time() + ttl


def _get_spotify_access_token() -> str:
    cached_token = _read_cached_spotify_token()
    if cached_token:
        return cached_token

    client_id, client_secret = _read_spotify_credentials()
    if not client_id or not client_secret:
        return ''

    basic_auth = base64.b64encode(f'{client_id}:{client_secret}'.encode('utf-8')).decode('ascii')
    payload = _download_json_request(
        'https://accounts.spotify.com/api/token',
        method='POST',
        headers={
            'Authorization': f'Basic {basic_auth}',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        },
        data=b'grant_type=client_credentials',
    )

    access_token = _normalize_spaces(str(payload.get('access_token') or ''))
    expires_in = int(payload.get('expires_in') or 0)
    if not access_token:
        return ''

    _cache_spotify_token(access_token, expires_in)
    return access_token


def _normalize_match_text(value: str) -> str:
    normalized = _normalize_spaces(value).lower()
    normalized = unicodedata.normalize('NFKD', normalized)
    normalized = ''.join(ch for ch in normalized if not unicodedata.combining(ch))
    normalized = re.sub(r'[^a-z0-9]+', ' ', normalized)
    return _normalize_spaces(normalized)


def _tokenize_match_text(value: str) -> list[str]:
    normalized = _normalize_match_text(value)
    if not normalized:
        return []
    return [token for token in normalized.split(' ') if token]


def _normalize_song_title_key(value: str) -> str:
    normalized = _normalize_match_text(value)
    if not normalized:
        return ''

    normalized = normalized.replace('ao vivo', ' ')
    tokens = [
        token for token in normalized.split(' ')
        if token and token not in _SONG_TITLE_VARIATION_TOKENS
    ]
    if not tokens:
        return ''
    return _normalize_spaces(' '.join(tokens))


def _normalize_song_artist_key(value: str) -> str:
    normalized = _normalize_match_text(value)
    if not normalized:
        return ''

    pattern = r'\b(?:' + '|'.join(_SONG_ARTIST_SPLIT_TOKENS) + r')\b'
    primary = re.split(pattern, normalized, maxsplit=1)[0]
    return _normalize_spaces(primary)


def _build_song_result_signature(item: dict[str, str]) -> str:
    title_key = _normalize_song_title_key(str(item.get('title') or ''))
    artist_key = _normalize_song_artist_key(str(item.get('artist') or ''))
    if title_key and artist_key:
        return f'{title_key}|{artist_key}'
    if title_key:
        return title_key
    return ''


def _score_song_search_result(
    *,
    query_norm: str,
    query_tokens: set[str],
    query_title_key: str,
    item: dict[str, str],
) -> tuple[int, int]:
    title = str(item.get('title') or '')
    artist = str(item.get('artist') or '')
    title_norm = _normalize_match_text(title)
    artist_norm = _normalize_match_text(artist)
    combined_norm = _normalize_spaces(f'{title_norm} {artist_norm}')
    title_tokens = set(_tokenize_match_text(title))
    artist_tokens = set(_tokenize_match_text(artist))
    combined_tokens = title_tokens | artist_tokens

    overlap_total = len(query_tokens & combined_tokens) if query_tokens else 0
    overlap_title = len(query_tokens & title_tokens) if query_tokens else 0
    overlap_artist = len(query_tokens & artist_tokens) if query_tokens else 0

    score = 0
    query_norm_len = len(query_norm)
    if query_norm and title_norm:
        if query_norm == title_norm:
            score += 170
        elif query_norm_len >= 3 and title_norm.startswith(query_norm):
            score += 140
        elif query_norm_len >= 3 and query_norm in title_norm:
            score += 115
        elif query_norm_len >= 4 and title_norm in query_norm:
            score += 70

    if query_norm and combined_norm:
        if query_norm == combined_norm:
            score += 130
        elif query_norm_len >= 3 and combined_norm.startswith(query_norm):
            score += 95
        elif query_norm_len >= 3 and query_norm in combined_norm:
            score += 80

    score += overlap_title * 24
    score += overlap_artist * 14
    score += overlap_total * 9

    query_token_count = len(query_tokens)
    if query_token_count > 0:
        coverage = overlap_total / query_token_count
        score += int(coverage * 85)
        if query_token_count >= 4 and overlap_total <= 1:
            score -= 95
        elif query_token_count >= 3 and overlap_total == 0:
            score -= 90
        elif query_token_count == 2 and overlap_total == 0:
            score -= 70

    title_key = _normalize_song_title_key(title)
    if query_title_key and title_key and query_title_key == title_key:
        score += 85

    return score, overlap_total


def _is_song_search_result_relevant(
    *,
    score: int,
    overlap_total: int,
    query_norm: str,
    query_tokens: set[str],
    item: dict[str, str],
) -> bool:
    title_norm = _normalize_match_text(str(item.get('title') or ''))
    artist_norm = _normalize_match_text(str(item.get('artist') or ''))
    combined_norm = _normalize_spaces(f'{title_norm} {artist_norm}')
    title_tokens = set(_tokenize_match_text(str(item.get('title') or '')))
    artist_tokens = set(_tokenize_match_text(str(item.get('artist') or '')))
    candidate_tokens = title_tokens | artist_tokens
    query_norm_len = len(query_norm)

    if query_norm and (query_norm in title_norm or query_norm in combined_norm):
        if query_norm_len >= 4:
            return True
        if query_norm in candidate_tokens:
            return True

    token_count = len(query_tokens)
    if token_count >= 4:
        return overlap_total >= 2 and score >= 35
    if token_count >= 2:
        return overlap_total >= 1 and score >= 25
    if token_count == 1:
        only_token = next(iter(query_tokens), '')
        if len(only_token) <= 2:
            return overlap_total >= 1 and score >= 24
        return overlap_total >= 1 and score >= 14
    return score >= 12


def _rank_song_search_results(
    *,
    query: str,
    source_batches: list[list[dict[str, str]]],
) -> list[dict[str, str]]:
    query_norm = _normalize_match_text(query)
    query_tokens = set(_tokenize_match_text(query))
    query_title_key = _normalize_song_title_key(query)
    candidates: list[tuple[tuple[int, int, int, int], dict[str, str]]] = []

    for source_index, batch in enumerate(source_batches):
        for batch_index, item in enumerate(batch):
            if not isinstance(item, dict):
                continue

            score, overlap_total = _score_song_search_result(
                query_norm=query_norm,
                query_tokens=query_tokens,
                query_title_key=query_title_key,
                item=item,
            )
            if not _is_song_search_result_relevant(
                score=score,
                overlap_total=overlap_total,
                query_norm=query_norm,
                query_tokens=query_tokens,
                item=item,
            ):
                continue

            # score desc, token overlap desc, source asc, batch position asc
            ranking_key = (-score, -overlap_total, source_index, batch_index)
            candidates.append((ranking_key, item))

    candidates.sort(key=lambda candidate: candidate[0])

    deduped: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    seen_signatures: set[str] = set()
    for _ranking, item in candidates:
        url_key = _normalize_spaces(str(item.get('url') or '')).lower()
        if not url_key or url_key in seen_urls:
            continue

        signature = _build_song_result_signature(item)
        if signature and signature in seen_signatures:
            continue

        seen_urls.add(url_key)
        if signature:
            seen_signatures.add(signature)
        deduped.append(item)

    return deduped


def _score_spotify_track_match(expected_title: str, expected_artist: str, track: dict[str, object]) -> int:
    title = _normalize_match_text(str(track.get('name') or ''))
    artists_raw = track.get('artists')
    artist_names: list[str] = []
    if isinstance(artists_raw, list):
        for item in artists_raw:
            if isinstance(item, dict):
                artist_names.append(_normalize_match_text(str(item.get('name') or '')))
    artist_joined = ' '.join(item for item in artist_names if item)

    expected_title_norm = _normalize_match_text(expected_title)
    expected_artist_norm = _normalize_match_text(expected_artist)

    score = 0
    if expected_title_norm and title:
        if expected_title_norm == title:
            score += 6
        elif expected_title_norm in title or title in expected_title_norm:
            score += 3

    if expected_artist_norm and artist_joined:
        if expected_artist_norm == artist_joined:
            score += 6
        elif expected_artist_norm in artist_joined or artist_joined in expected_artist_norm:
            score += 3

    if score == 0 and title:
        # Fallback ranking when metadata is sparse.
        score = 1

    return score


def _search_best_spotify_track_id(title: str, artist: str, access_token: str) -> str:
    if title and artist:
        query = _normalize_spaces(f'track:{title} artist:{artist}')
    else:
        query = _normalize_spaces(f'{title} {artist}')
    if not query:
        return ''

    payload = _download_json_request(
        f'https://api.spotify.com/v1/search?type=track&limit=7&q={quote_plus(query)}',
        headers={
            'Authorization': f'Bearer {access_token}',
            'Accept': 'application/json',
        },
    )

    tracks = payload.get('tracks', {})
    items = tracks.get('items') if isinstance(tracks, dict) else None
    if not isinstance(items, list):
        return ''

    ranked_items: list[tuple[int, str]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        track_id = _normalize_spaces(str(item.get('id') or ''))
        if not track_id:
            continue
        score = _score_spotify_track_match(title, artist, item)
        ranked_items.append((score, track_id))

    if not ranked_items:
        return ''

    ranked_items.sort(key=lambda pair: pair[0], reverse=True)
    return ranked_items[0][1]


def _map_spotify_key(key: int, mode: int) -> str:
    if key < 0 or key >= len(_SPOTIFY_KEY_NOTES_SHARP):
        return ''
    root = _SPOTIFY_KEY_NOTES_SHARP[key]
    if not root:
        return ''
    if mode == 0:
        return f'{root}m'
    return root


def _build_song_key_cache_key(title: str, artist: str) -> str:
    return _normalize_spaces(f'{title}|{artist}').lower()


def detect_song_key_with_api(raw_title: str, raw_artist: str = '') -> str:
    title = _normalize_spaces(raw_title)
    artist = _normalize_spaces(raw_artist)
    if not title and not artist:
        return ''

    cache_key = _build_song_key_cache_key(title, artist)
    cached_key = _normalize_spaces(_DETECTED_KEY_CACHE.get(cache_key, ''))
    if cached_key:
        return cached_key

    access_token = _get_spotify_access_token()
    if not access_token:
        return ''

    try:
        track_id = _search_best_spotify_track_id(title, artist, access_token)
        if not track_id:
            return ''

        feature_payload = _download_json_request(
            f'https://api.spotify.com/v1/audio-features/{track_id}',
            headers={
                'Authorization': f'Bearer {access_token}',
                'Accept': 'application/json',
            },
        )
        key_value = int(feature_payload.get('key'))
        mode_value = int(feature_payload.get('mode'))
        detected_key = _map_spotify_key(key_value, mode_value)
        if detected_key:
            _DETECTED_KEY_CACHE[cache_key] = detected_key
            label = _normalize_spaces(f'{title} - {artist}').strip('- ').strip()
            if label:
                _log_song_key_event(f'Tom identificado por API ({detected_key}) para {label}.')
        return detected_key
    except Exception as exc:
        _log_song_key_event(f'Falha ao identificar tom por API: {exc}')
        return ''


def detect_song_key(raw_title: str, raw_artist: str = '') -> dict[str, str]:
    title = _normalize_spaces(raw_title)
    artist = _normalize_spaces(raw_artist)
    if not title and not artist:
        raise ValueError('Informe titulo ou artista para identificar o tom.')

    key = detect_song_key_with_api(title, artist)
    if not key:
        raise RuntimeError('Nao foi possivel identificar o tom por API para esta musica.')

    return {
        'title': title or 'Musica',
        'artist': artist,
        'original_key': key,
        'source': 'spotify',
        'source_label': 'Spotify Audio Features',
    }


def _normalize_search_query(raw_query: str) -> str:
    query = _normalize_spaces(raw_query or '')
    if len(query) < 2:
        raise ValueError('Digite pelo menos 2 caracteres para buscar a musica.')
    return query


def _normalize_limit(raw_limit: int) -> int:
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        return 18
    return max(1, min(40, limit))


def _normalize_page(raw_page: int) -> int:
    try:
        page = int(raw_page)
    except (TypeError, ValueError):
        return 1
    return max(1, min(100, page))


def _search_cifraclub(query: str, limit: int) -> list[dict[str, str]]:
    payload = _download_json(f'https://solr.sscdn.co/cc/c7/?q={quote_plus(query)}&limit={limit}')
    docs = payload.get('response', {}).get('docs', [])
    if not isinstance(docs, list):
        return []

    results: list[dict[str, str]] = []
    for doc in docs:
        if not isinstance(doc, dict):
            continue

        title = _normalize_spaces(str(doc.get('txt', '')))
        artist = _normalize_spaces(str(doc.get('art', '')))
        artist_slug = _normalize_spaces(str(doc.get('dns', '')))
        song_slug = _normalize_spaces(str(doc.get('url', '')))
        image_url = _normalize_spaces(str(doc.get('imgm', '')))

        if not title or not artist_slug or not song_slug:
            continue

        results.append(
            {
                'source': 'cifraclub',
                'source_label': 'Cifra Club',
                'title': title,
                'artist': artist,
                'url': f'https://www.cifraclub.com.br/{artist_slug}/{song_slug}/',
                'image_url': image_url,
            }
        )

        if len(results) >= limit:
            break

    return results


def _search_cifras(query: str, limit: int) -> list[dict[str, str]]:
    payload = _download_json(f'https://www.cifras.com.br/api/search?q={quote_plus(query)}')
    songs = payload.get('songs', [])
    if not isinstance(songs, list):
        return []

    results: list[dict[str, str]] = []
    for item in songs:
        if not isinstance(item, dict):
            continue

        title = _normalize_spaces(str(item.get('TITULO', '')))
        artist = _normalize_spaces(str(item.get('ARTISTA', '')))
        artist_slug = _normalize_spaces(str(item.get('COD_ARTISTA', '')))
        song_slug = _normalize_spaces(str(item.get('COD_TITULO', '')))
        image_url = _normalize_spaces(str(item.get('AVATAR', '')))
        if not title or not artist_slug or not song_slug:
            continue

        results.append(
            {
                'source': 'cifras',
                'source_label': 'Cifras',
                'title': title,
                'artist': artist,
                'url': f'https://www.cifras.com.br/cifra/{artist_slug}/{song_slug}',
                'image_url': image_url,
            }
        )

        if len(results) >= limit:
            break

    return results


def search_song_portals(
    raw_query: str,
    *,
    page: int = 1,
    page_size: int = 18,
) -> dict[str, object]:
    query = _normalize_search_query(raw_query)
    safe_page = _normalize_page(page)
    safe_page_size = _normalize_limit(page_size)
    page_start = (safe_page - 1) * safe_page_size
    page_end = page_start + safe_page_size
    # Build a larger candidate pool so relevance scoring can re-order noisy responses.
    fetch_limit = min(240, max(page_end + 1, safe_page_size * 4))

    source_batches: list[list[dict[str, str]]] = []
    errors: list[str] = []

    for search_fn in (_search_cifraclub, _search_cifras):
        try:
            found = search_fn(query, fetch_limit)
        except Exception as exc:
            errors.append(str(exc))
            continue

        if found:
            source_batches.append(found)

    if not source_batches and errors:
        raise RuntimeError('Nao foi possivel pesquisar musicas nos portais agora. Tente novamente.')

    merged_results = _rank_song_search_results(
        query=query,
        source_batches=source_batches,
    )

    has_more = len(merged_results) > page_end
    page_results = merged_results[page_start:page_end]
    total_known = len(merged_results)

    return {
        'page': safe_page,
        'page_size': safe_page_size,
        'total': total_known,
        'has_more': has_more,
        'results': page_results,
    }


def _extract_title_and_artist_cifraclub(html: str) -> tuple[str, str]:
    default_title = 'Musica'
    default_artist = 'Artista'

    title_match = re.search(r'(?is)<title>(.*?)</title>', html)
    if not title_match:
        return default_title, default_artist

    raw_title = _normalize_spaces(unescape(title_match.group(1)))
    parts = [part.strip() for part in raw_title.split(' - ') if part.strip()]

    if len(parts) >= 3 and parts[-1].lower().startswith('cifra club'):
        artist = parts[-2]
        title = ' - '.join(parts[:-2]).strip() or default_title
        return title, artist or default_artist

    return raw_title or default_title, default_artist


def _extract_title_and_artist_cifras(html: str) -> tuple[str, str]:
    default_title = 'Musica'
    default_artist = 'Artista'

    title_meta_match = re.search(r"(?is)\bNAME:\s*'([^']+)'", html)
    artist_meta_match = re.search(r"(?is)\bARTIST_NAME:\s*'([^']+)'", html)
    if title_meta_match:
        title = _normalize_spaces(unescape(title_meta_match.group(1)))
        artist = _normalize_spaces(unescape(artist_meta_match.group(1))) if artist_meta_match else default_artist
        return title or default_title, artist or default_artist

    title_match = re.search(r'(?is)<title>(.*?)</title>', html)
    if not title_match:
        return default_title, default_artist

    raw_title = _normalize_spaces(unescape(title_match.group(1)))
    parts = [part.strip() for part in raw_title.split(' - ') if part.strip()]
    if len(parts) >= 2:
        left = parts[0] or default_title
        right = parts[1].split('|', maxsplit=1)[0].strip() or default_artist
        return left, right

    return raw_title or default_title, default_artist


def _extract_original_key_cifraclub(html: str) -> str:
    key_match = re.search(
        r'(?is)id=["\']cifra_tom["\'][^>]*>.*?<a[^>]*>([^<]+)</a>',
        html,
    )
    if not key_match:
        return ''

    return _canonical_note(_normalize_spaces(unescape(key_match.group(1))))


def _extract_original_key_cifras(html: str) -> str:
    key_match = re.search(r"(?is)\bCHORDS_KEY:\s*'([^']+)'", html)
    if not key_match:
        return ''
    return _canonical_note(_normalize_spaces(unescape(key_match.group(1))))


def _extract_chord_lyrics_from_html_block(block: str) -> str:
    if not block:
        raise RuntimeError('Nao foi possivel identificar a cifra nesta pagina.')

    text = block
    text = re.sub(
        r'(?is)<span[^>]*data-chord=["\']([^"\']+)["\'][^>]*>.*?</span>',
        lambda m: f'[{_normalize_spaces(unescape(m.group(1)))}]',
        text,
    )
    text = re.sub(
        r'(?is)<b[^>]*>\s*([^<]+?)\s*</b>',
        lambda m: f'[{_normalize_spaces(unescape(m.group(1)))}]',
        text,
    )
    text = re.sub(r'(?i)<br\s*/?>', '\n', text)
    text = re.sub(r'(?i)</p\s*>', '\n', text)
    text = re.sub(r'(?is)<p[^>]*>', '', text)
    text = re.sub(r'(?is)<[^>]+>', '', text)
    text = unescape(text)

    normalized = _normalize_lyrics_text(text)
    if not normalized:
        raise RuntimeError('A cifra foi encontrada, mas o conteudo veio vazio.')

    return normalized


def _extract_chord_lyrics_cifraclub(html: str) -> str:
    pre_match = re.search(r'(?is)<pre[^>]*>(.*?)</pre>', html)
    if not pre_match:
        raise RuntimeError('Nao foi possivel identificar a cifra nesta pagina.')
    return _extract_chord_lyrics_from_html_block(pre_match.group(1))


def _decode_js_string(raw_value: str) -> str:
    try:
        return json.loads(f'"{raw_value}"')
    except json.JSONDecodeError:
        return raw_value.encode('utf-8', errors='ignore').decode('unicode_escape', errors='ignore')


def _extract_chord_lyrics_cifras(html: str) -> str:
    script_match = re.search(r'(?is)\bCHORDS_CONTENT:\s*"((?:\\.|[^"\\])*)"', html)
    if script_match:
        decoded_block = _decode_js_string(script_match.group(1))
        return _extract_chord_lyrics_from_html_block(decoded_block)

    pre_match = re.search(r'(?is)<song-chord[^>]*>.*?<pre[^>]*>(.*?)</pre>', html)
    if pre_match:
        return _extract_chord_lyrics_from_html_block(pre_match.group(1))

    raise RuntimeError('Nao foi possivel identificar a cifra nesta pagina.')


def extract_plain_lyrics_from_chords_text(chords_text: str) -> str:
    if not (chords_text or '').strip():
        raise RuntimeError('Nao foi possivel gerar letra a partir da cifra.')

    normalized_breaks = chords_text.replace('\r\n', '\n').replace('\r', '\n')
    output_lines: list[str] = []

    for raw_line in normalized_breaks.split('\n'):
        if not raw_line.strip():
            output_lines.append('')
            continue

        line_without_chords = _CHORD_TOKEN_PATTERN.sub('', raw_line)
        line_without_empty_parenthesis = re.sub(r'\(\s*\)', '', line_without_chords)
        compacted_line = re.sub(r'[ \t]{2,}', ' ', line_without_empty_parenthesis).strip()

        # Drop lines that were only chord marks/separators.
        if not compacted_line:
            only_markers = re.sub(r'[\s|/\\\-()]+', '', line_without_chords)
            if not only_markers:
                continue
            output_lines.append('')
            continue

        # Drop separator-only lines after removing chord tokens.
        if not re.search(r'[0-9A-Za-zÀ-ÖØ-öø-ÿ]', compacted_line):
            continue

        output_lines.append(compacted_line)

    normalized = _normalize_lyrics_text('\n'.join(output_lines))
    normalized = re.sub(r'\n{3,}', '\n\n', normalized)
    if not normalized:
        raise RuntimeError('Nao foi possivel gerar letra a partir da cifra.')

    return normalized


def _fetch_song_from_cifraclub_url(url: str) -> dict[str, str]:
    html = _download_text(url)
    title, artist = _extract_title_and_artist_cifraclub(html)
    original_key = _extract_original_key_cifraclub(html)
    if not original_key:
        original_key = detect_song_key_with_api(title, artist)
    lyrics = _extract_chord_lyrics_cifraclub(html)

    return {
        'source': 'cifraclub',
        'source_label': 'Cifra Club',
        'url': url,
        'title': title,
        'artist': artist,
        'original_key': original_key,
        'lyrics': lyrics,
    }


def _fetch_song_from_cifras_url(url: str) -> dict[str, str]:
    html = _download_text(url)
    title, artist = _extract_title_and_artist_cifras(html)
    original_key = _extract_original_key_cifras(html)
    if not original_key:
        original_key = detect_song_key_with_api(title, artist)
    lyrics = _extract_chord_lyrics_cifras(html)

    return {
        'source': 'cifras',
        'source_label': 'Cifras',
        'url': url,
        'title': title,
        'artist': artist,
        'original_key': original_key,
        'lyrics': lyrics,
    }


def _resolve_song_url_for_lyrics(raw_title: str, raw_artist: str, raw_source_url: str) -> str:
    source_url = _normalize_spaces(raw_source_url or '')
    if source_url:
        return source_url

    query = _normalize_spaces(f'{raw_title} {raw_artist}')
    if len(query) >= 2:
        search_payload = search_song_portals(query, page=1, page_size=1)
        results = search_payload.get('results', [])
        if isinstance(results, list) and results and isinstance(results[0], dict):
            candidate_url = _normalize_spaces(results[0].get('url', ''))
            if candidate_url:
                return candidate_url

    raise ValueError('Informe um link de cifra valido para gerar a letra.')


def fetch_lyrics_from_chords(raw_title: str, raw_artist: str = '', raw_source_url: str = '') -> dict[str, str]:
    title = _normalize_spaces(raw_title or '')
    artist = _normalize_spaces(raw_artist or '')
    source_url = _resolve_song_url_for_lyrics(title, artist, raw_source_url)
    chord_song = fetch_song_from_url(source_url)

    chords_text = str(chord_song.get('lyrics') or '')
    plain_lyrics = extract_plain_lyrics_from_chords_text(chords_text)

    return {
        'source': str(chord_song.get('source') or ''),
        'source_label': str(chord_song.get('source_label') or ''),
        'url': str(chord_song.get('url') or source_url),
        'title': str(chord_song.get('title') or title or 'Musica'),
        'artist': str(chord_song.get('artist') or artist),
        'original_key': '',
        'lyrics': plain_lyrics,
    }


def fetch_song_from_url(raw_url: str) -> dict[str, str]:
    url, source = _normalize_song_url(raw_url)
    if source == 'cifraclub':
        return _fetch_song_from_cifraclub_url(url)
    if source == 'cifras':
        return _fetch_song_from_cifras_url(url)
    raise ValueError('Portal de cifra nao suportado.')
