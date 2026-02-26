from __future__ import annotations

import json
import re
import unicodedata
from html import unescape
from urllib.parse import quote_plus, urlparse, urlunparse
from urllib.request import Request, urlopen

from pydantic import BaseModel

CIFRACLUB_HOST_SUFFIXES = ('cifraclub.com.br', 'cifraclub.com')
CIFRAS_HOST_SUFFIXES = ('cifras.com.br',)
LETRAS_HOST_SUFFIXES = ('letras.mus.br', 'letras.com')


class SongFetchRequest(BaseModel):
    url: str


class SongLyricsFetchRequest(BaseModel):
    title: str = ''
    artist: str = ''
    source_url: str = ''


class SongSearchRequest(BaseModel):
    query: str
    limit: int = 18


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
    if any(hostname.endswith(suffix) for suffix in LETRAS_HOST_SUFFIXES):
        return 'letras'
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


def _slugify_text(value: str) -> str:
    normalized = unicodedata.normalize('NFKD', value or '')
    ascii_only = normalized.encode('ascii', errors='ignore').decode('ascii')
    cleaned = ascii_only.lower()
    cleaned = cleaned.replace('&', ' e ')
    cleaned = re.sub(r'[^a-z0-9]+', '-', cleaned)
    cleaned = re.sub(r'-{2,}', '-', cleaned).strip('-')
    return cleaned


def _normalize_slug(value: str) -> str:
    slug = (value or '').strip().strip('/')
    slug = re.sub(r'-{2,}', '-', slug)
    return slug.lower()


def _extract_slug_hints_from_source_url(raw_url: str) -> tuple[str, str] | None:
    safe_url = (raw_url or '').strip()
    if not safe_url:
        return None

    if '://' not in safe_url:
        safe_url = f'https://{safe_url}'

    parsed = urlparse(safe_url)
    hostname = (parsed.hostname or '').lower()
    source = _parse_song_source(hostname)
    if not source:
        return None

    path_parts = [part for part in (parsed.path or '').split('/') if part]
    if source == 'cifraclub' and len(path_parts) >= 2:
        return _normalize_slug(path_parts[0]), _normalize_slug(path_parts[1])
    if source == 'cifras' and len(path_parts) >= 3 and path_parts[0].lower() == 'cifra':
        return _normalize_slug(path_parts[1]), _normalize_slug(path_parts[2])
    if source == 'letras' and len(path_parts) >= 2:
        return _normalize_slug(path_parts[0]), _normalize_slug(path_parts[1])
    return None


def _build_letras_candidate_urls(raw_title: str, raw_artist: str, raw_source_url: str) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def append_candidate(artist_slug: str, song_slug: str) -> None:
        artist_clean = _normalize_slug(artist_slug)
        song_clean = _normalize_slug(song_slug)
        if not artist_clean or not song_clean:
            return

        candidate_url = f'https://www.letras.mus.br/{artist_clean}/{song_clean}/'
        if candidate_url in seen:
            return

        seen.add(candidate_url)
        candidates.append(candidate_url)

    source_slug_pair = _extract_slug_hints_from_source_url(raw_source_url)
    if source_slug_pair:
        append_candidate(source_slug_pair[0], source_slug_pair[1])

    title_slug = _slugify_text(raw_title)
    artist_slug = _slugify_text(raw_artist)
    if artist_slug and title_slug:
        append_candidate(artist_slug, title_slug)

    search_query = _normalize_spaces(f'{raw_title} {raw_artist}')
    if len(search_query) >= 2:
        try:
            search_results = _search_cifraclub(search_query, 12)
        except Exception:
            search_results = []

        for result in search_results:
            pair = _extract_slug_hints_from_source_url(result.get('url', ''))
            if not pair:
                continue
            append_candidate(pair[0], pair[1])

    return candidates


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


def search_song_portals(raw_query: str, limit: int = 18) -> list[dict[str, str]]:
    query = _normalize_search_query(raw_query)
    max_items = _normalize_limit(limit)

    source_batches: list[list[dict[str, str]]] = []
    errors: list[str] = []

    for search_fn in (_search_cifraclub, _search_cifras):
        try:
            found = search_fn(query, max_items)
        except Exception as exc:
            errors.append(str(exc))
            continue

        if found:
            source_batches.append(found)

    if not source_batches and errors:
        raise RuntimeError('Nao foi possivel pesquisar musicas nos portais agora. Tente novamente.')

    merged_results: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    row_index = 0

    while len(merged_results) < max_items:
        appended_any = False
        for batch in source_batches:
            if row_index >= len(batch):
                continue

            item = batch[row_index]
            url = item.get('url', '').strip().lower()
            if not url or url in seen_urls:
                continue

            seen_urls.add(url)
            merged_results.append(item)
            appended_any = True
            if len(merged_results) >= max_items:
                break

        if not appended_any:
            break
        row_index += 1

    return merged_results


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


def _extract_title_and_artist_letras(html: str) -> tuple[str, str]:
    default_title = 'Musica'
    default_artist = 'Artista'

    title_match = re.search(r'(?is)<title>(.*?)</title>', html)
    if not title_match:
        return default_title, default_artist

    raw_title = _normalize_spaces(unescape(title_match.group(1)))
    parts = [part.strip() for part in raw_title.split(' - ') if part.strip()]
    if len(parts) >= 3 and 'letras' in parts[-1].lower():
        title = parts[0] or default_title
        artist = parts[1] or default_artist
        return title, artist

    if len(parts) >= 2:
        return parts[0] or default_title, parts[1] or default_artist

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


def _extract_lyrics_letras(html: str) -> str:
    block_match = re.search(
        r'(?is)<div[^>]*class=["\'][^"\']*\blyric-original\b[^"\']*["\'][^>]*>(.*?)</div>',
        html,
    )
    if not block_match:
        raise RuntimeError('Nao foi possivel identificar a letra nesta pagina do Letras.mus.br.')

    text = block_match.group(1)
    text = re.sub(r'(?i)<br\s*/?>', '\n', text)
    text = re.sub(r'(?is)</p\s*>', '\n\n', text)
    text = re.sub(r'(?is)<p[^>]*>', '', text)
    text = re.sub(r'(?is)<[^>]+>', '', text)
    text = unescape(text)

    normalized = _normalize_lyrics_text(text)
    if not normalized:
        raise RuntimeError('A letra foi encontrada, mas o conteudo veio vazio.')

    return normalized


def _fetch_song_from_cifraclub_url(url: str) -> dict[str, str]:
    html = _download_text(url)
    title, artist = _extract_title_and_artist_cifraclub(html)
    original_key = _extract_original_key_cifraclub(html)
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


def _normalize_text_for_match(text: str) -> str:
    return _slugify_text(text).replace('-', ' ').strip()


def _score_lyrics_candidate(
    expected_title: str,
    expected_artist: str,
    candidate_title: str,
    candidate_artist: str,
) -> int:
    score = 0

    exp_title = _normalize_text_for_match(expected_title)
    exp_artist = _normalize_text_for_match(expected_artist)
    cand_title = _normalize_text_for_match(candidate_title)
    cand_artist = _normalize_text_for_match(candidate_artist)

    if exp_title and cand_title:
        if exp_title == cand_title:
            score += 3
        elif exp_title in cand_title or cand_title in exp_title:
            score += 1

    if exp_artist and cand_artist:
        if exp_artist == cand_artist:
            score += 3
        elif exp_artist in cand_artist or cand_artist in exp_artist:
            score += 1

    return score


def fetch_lyrics_from_letras(raw_title: str, raw_artist: str = '', raw_source_url: str = '') -> dict[str, str]:
    title = _normalize_spaces(raw_title or '')
    artist = _normalize_spaces(raw_artist or '')
    source_url = _normalize_spaces(raw_source_url or '')

    if not title and not source_url:
        raise ValueError('Informe pelo menos o nome da musica para buscar a letra.')

    candidate_urls = _build_letras_candidate_urls(title, artist, source_url)
    if not candidate_urls:
        raise RuntimeError('Nao foi possivel montar um link valido para buscar a letra no Letras.mus.br.')

    best_match: dict[str, str] | None = None
    best_score = -1

    for candidate_url in candidate_urls:
        try:
            html = _download_text(candidate_url)
            candidate_title, candidate_artist = _extract_title_and_artist_letras(html)
            lyrics = _extract_lyrics_letras(html)
        except Exception:
            continue

        score = _score_lyrics_candidate(title, artist, candidate_title, candidate_artist)
        if score > best_score:
            best_score = score
            best_match = {
                'source': 'letras',
                'source_label': 'Letras.mus.br',
                'url': candidate_url,
                'title': candidate_title or title or 'Musica',
                'artist': candidate_artist or artist,
                'original_key': '',
                'lyrics': lyrics,
            }

        if score >= 6:
            break

    if best_match:
        return best_match

    raise RuntimeError('Nao foi possivel carregar a letra no Letras.mus.br para esta musica.')


def fetch_song_from_url(raw_url: str) -> dict[str, str]:
    url, source = _normalize_song_url(raw_url)
    if source == 'cifraclub':
        return _fetch_song_from_cifraclub_url(url)
    if source == 'cifras':
        return _fetch_song_from_cifras_url(url)
    raise ValueError('Portal de cifra nao suportado.')


def fetch_song_from_cifraclub(raw_url: str) -> dict[str, str]:
    url, source = _normalize_song_url(raw_url)
    if source != 'cifraclub':
        raise ValueError('Informe um link do Cifra Club.')
    return _fetch_song_from_cifraclub_url(url)


def fetch_song_from_cifras(raw_url: str) -> dict[str, str]:
    url, source = _normalize_song_url(raw_url)
    if source != 'cifras':
        raise ValueError('Informe um link do Cifras.com.br.')
    return _fetch_song_from_cifras_url(url)
