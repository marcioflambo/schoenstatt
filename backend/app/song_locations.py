from __future__ import annotations

import json
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from pydantic import BaseModel

from .json_store_db import load_store, save_store


class SongLocationNodeCreateRequest(BaseModel):
    parent_id: str | None = None
    label: str
    order_index: int | None = None


class SongLocationNodeUpdateRequest(BaseModel):
    parent_id: str | None = None
    label: str | None = None
    order_index: int | None = None
    assignment_mode: str | None = None
    mystery_group_title: str | None = None
    mystery_title: str | None = None


class SongLocationNodeReorderRequest(BaseModel):
    parent_id: str | None = None
    ordered_ids: list[str]


_STORE_LOCK = RLock()
_STORE_KEY = 'song_locations'
_ASSIGNMENT_MODE_MYSTERY = 'mystery'
_ASSIGNMENT_MODE_LOCATION = 'location'
_DEFAULT_MYSTERY_ROOT_LABEL = 'Misterios'


def _normalize_spaces(value: str | None) -> str:
    return ' '.join((value or '').split()).strip()


def _coerce_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_bool(value: object, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = _normalize_spaces(value).lower()
        if not normalized:
            return default
        if normalized in {'0', 'false', 'no', 'nao', 'off', 'inativo', 'inactive'}:
            return False
        if normalized in {'1', 'true', 'yes', 'sim', 'on', 'ativo', 'active'}:
            return True
    return default


def _normalize_assignment_mode(value: str | None) -> str:
    token = _normalize_spaces(value).lower()
    if token == _ASSIGNMENT_MODE_MYSTERY:
        return _ASSIGNMENT_MODE_MYSTERY
    return _ASSIGNMENT_MODE_LOCATION


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_store() -> dict[str, object]:
    return {
        'last_id': 0,
        'nodes': [],
    }


def _normalize_node_row(raw_row: dict[str, object]) -> dict[str, object]:
    node_id = _normalize_spaces(str(raw_row.get('node_id') or raw_row.get('nodeId') or raw_row.get('id') or ''))
    parent_id = _normalize_spaces(str(raw_row.get('parent_id') or raw_row.get('parentId') or ''))
    label = _normalize_spaces(str(raw_row.get('label') or ''))
    raw_is_active = raw_row.get('is_active')
    if raw_is_active is None:
        raw_is_active = raw_row.get('isActive')
    assignment_mode = _normalize_assignment_mode(
        str(raw_row.get('assignment_mode') or raw_row.get('assignmentMode') or '')
    )
    mystery_group_title = _normalize_spaces(
        str(raw_row.get('mystery_group_title') or raw_row.get('mysteryGroupTitle') or '')
    )
    mystery_title = _normalize_spaces(str(raw_row.get('mystery_title') or raw_row.get('mysteryTitle') or ''))
    if assignment_mode != _ASSIGNMENT_MODE_MYSTERY:
        mystery_group_title = ''
        mystery_title = ''

    return {
        'node_id': node_id,
        'parent_id': parent_id,
        'label': label,
        'order_index': max(
            _coerce_int(raw_row.get('order_index') or raw_row.get('orderIndex'), 0),
            1,
        ),
        'assignment_mode': assignment_mode,
        'mystery_group_title': mystery_group_title,
        'mystery_title': mystery_title,
        'is_active': _coerce_bool(raw_is_active, default=True),
        'deleted_at_utc': str(raw_row.get('deleted_at_utc') or raw_row.get('deletedAtUtc') or ''),
        'created_at_utc': str(raw_row.get('created_at_utc') or raw_row.get('createdAtUtc') or ''),
        'updated_at_utc': str(raw_row.get('updated_at_utc') or raw_row.get('updatedAtUtc') or ''),
    }


def _normalize_store(raw_store: object) -> dict[str, object]:
    if not isinstance(raw_store, dict):
        return _empty_store()

    raw_nodes = raw_store.get('nodes')
    node_rows: list[dict[str, object]] = []
    if isinstance(raw_nodes, list):
        for item in raw_nodes:
            if isinstance(item, dict):
                row = _normalize_node_row(item)
                if row['node_id'] and row['label']:
                    node_rows.append(row)

    deduped_by_id: dict[str, dict[str, object]] = {}
    max_id = 0
    for row in node_rows:
        node_id = str(row.get('node_id') or '')
        if not node_id:
            continue
        previous = deduped_by_id.get(node_id)
        if not previous:
            deduped_by_id[node_id] = row
        elif str(row.get('updated_at_utc') or '') >= str(previous.get('updated_at_utc') or ''):
            deduped_by_id[node_id] = row

        try:
            max_id = max(max_id, int(node_id))
        except ValueError:
            pass

    normalized_rows = list(deduped_by_id.values())
    normalized_rows.sort(
        key=lambda row: (
            str(row.get('parent_id') or ''),
            _coerce_int(row.get('order_index'), 0),
            str(row.get('label') or ''),
            str(row.get('node_id') or ''),
        )
    )

    return {
        'last_id': max(_coerce_int(raw_store.get('last_id'), 0), max_id),
        'nodes': normalized_rows,
    }


def _read_portal_content_payload(portal_content_file: Path) -> dict[str, object] | None:
    if not portal_content_file.exists():
        return None
    try:
        # `utf-8-sig` handles optional BOM transparently.
        raw_payload = json.loads(portal_content_file.read_text(encoding='utf-8-sig'))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw_payload, dict):
        return None
    return raw_payload


def _read_portal_mystery_root_label(portal_content_file: Path) -> str:
    payload = _read_portal_content_payload(portal_content_file)
    if not isinstance(payload, dict):
        return _DEFAULT_MYSTERY_ROOT_LABEL
    ui_messages = payload.get('uiMessages')
    if not isinstance(ui_messages, dict):
        return _DEFAULT_MYSTERY_ROOT_LABEL
    mystery_messages = ui_messages.get('mystery')
    if not isinstance(mystery_messages, dict):
        return _DEFAULT_MYSTERY_ROOT_LABEL
    label = _normalize_spaces(str(mystery_messages.get('groupPickerTitle') or ''))
    return label or _DEFAULT_MYSTERY_ROOT_LABEL


def _read_portal_mystery_cards(portal_content_file: Path) -> list[dict[str, object]]:
    raw_payload = _read_portal_content_payload(portal_content_file)
    if not isinstance(raw_payload, dict):
        return []
    mystery_payload = raw_payload.get('misterios')
    if not isinstance(mystery_payload, dict):
        return []
    cards = mystery_payload.get('cards')
    if not isinstance(cards, list):
        return []
    normalized_cards: list[dict[str, object]] = []
    for item in cards:
        if not isinstance(item, dict):
            continue
        title = _normalize_spaces(str(item.get('title') or ''))
        day = _normalize_spaces(str(item.get('day') or ''))
        raw_items = item.get('items')
        items = [
            _normalize_spaces(str(raw_item))
            for raw_item in raw_items
            if isinstance(raw_items, list) and _normalize_spaces(str(raw_item))
        ] if isinstance(raw_items, list) else []
        if not title:
            continue
        normalized_cards.append({
            'title': title,
            'day': day,
            'items': items,
        })
    return normalized_cards


def _normalize_label_token(value: str | None) -> str:
    normalized = unicodedata.normalize('NFKD', _normalize_spaces(value).casefold())
    return ''.join(char for char in normalized if not unicodedata.combining(char))


def _is_legacy_minimal_default_store(rows: list[dict[str, object]]) -> bool:
    safe_rows = _sort_rows(rows)
    if len(safe_rows) != 4:
        return False

    rows_by_label: dict[str, dict[str, object]] = {}
    for row in safe_rows:
        rows_by_label[_normalize_label_token(str(row.get('label') or ''))] = row

    mysteries = rows_by_label.get('misterios')
    missa = rows_by_label.get('missa')
    festival = rows_by_label.get('festival')
    entrada = rows_by_label.get('entrada')
    if not all([mysteries, missa, festival, entrada]):
        return False

    mysteries_id = str(mysteries.get('node_id') or '')
    missa_id = str(missa.get('node_id') or '')
    festival_parent = str(festival.get('parent_id') or '')
    entrada_parent = str(entrada.get('parent_id') or '')
    has_mystery_assignment_leaf = any(
        str(row.get('assignment_mode') or '') == _ASSIGNMENT_MODE_MYSTERY
        for row in safe_rows
    )
    if has_mystery_assignment_leaf:
        return False

    # Legacy broken bootstrap: only root categories and one "Entrada" under "Missa".
    return (
        str(mysteries.get('parent_id') or '') == ''
        and str(missa.get('parent_id') or '') == ''
        and festival_parent == ''
        and entrada_parent == missa_id
        and mysteries_id != ''
    )


def _backfill_legacy_mystery_nodes(
    store: dict[str, object],
    portal_content_file: Path,
) -> dict[str, object]:
    rows_raw = store.get('nodes')
    rows = _sort_rows(rows_raw if isinstance(rows_raw, list) else [])
    if not _is_legacy_minimal_default_store(rows):
        return store

    mystery_cards = _read_portal_mystery_cards(portal_content_file)
    if not mystery_cards:
        return store

    mysteries_root = next(
        (
            row
            for row in rows
            if _normalize_label_token(str(row.get('label') or '')) == 'misterios'
            and str(row.get('parent_id') or '') == ''
        ),
        None,
    )
    if not mysteries_root:
        return store

    mysteries_root_id = str(mysteries_root.get('node_id') or '')
    if not mysteries_root_id:
        return store

    now_iso = _now_utc_iso()
    max_id = _coerce_int(store.get('last_id'), 0)
    for row in rows:
        try:
            max_id = max(max_id, int(str(row.get('node_id') or '0')))
        except ValueError:
            continue

    appended_rows: list[dict[str, object]] = []
    for group_index, card in enumerate(mystery_cards, start=1):
        group_title = _normalize_spaces(str(card.get('title') or ''))
        if not group_title:
            continue

        max_id += 1
        group_id = str(max_id)
        appended_rows.append({
            'node_id': group_id,
            'parent_id': mysteries_root_id,
            'label': group_title,
            'order_index': group_index,
            'assignment_mode': _ASSIGNMENT_MODE_LOCATION,
            'mystery_group_title': '',
            'mystery_title': '',
            'is_active': True,
            'deleted_at_utc': '',
            'created_at_utc': now_iso,
            'updated_at_utc': now_iso,
        })

        raw_items = card.get('items')
        mystery_items = raw_items if isinstance(raw_items, list) else []
        for item_index, raw_item in enumerate(mystery_items, start=1):
            item_title = _normalize_spaces(str(raw_item))
            if not item_title:
                continue
            max_id += 1
            appended_rows.append({
                'node_id': str(max_id),
                'parent_id': group_id,
                'label': item_title,
                'order_index': item_index,
                'assignment_mode': _ASSIGNMENT_MODE_MYSTERY,
                'mystery_group_title': group_title,
                'mystery_title': item_title,
                'is_active': True,
                'deleted_at_utc': '',
                'created_at_utc': now_iso,
                'updated_at_utc': now_iso,
            })

    if not appended_rows:
        return store

    return _normalize_store({
        'last_id': max_id,
        'nodes': [*rows, *appended_rows],
    })


def _build_default_store(base_last_id: int, portal_content_file: Path) -> dict[str, object]:
    now_iso = _now_utc_iso()
    next_id = max(base_last_id, 0)
    rows: list[dict[str, object]] = []

    def create_node(
        *,
        label: str,
        parent_id: str | None = None,
        order_index: int = 1,
        assignment_mode: str = _ASSIGNMENT_MODE_LOCATION,
        mystery_group_title: str = '',
        mystery_title: str = '',
    ) -> str:
        nonlocal next_id
        next_id += 1
        node_id = str(next_id)
        rows.append({
            'node_id': node_id,
            'parent_id': _normalize_spaces(parent_id),
            'label': _normalize_spaces(label),
            'order_index': max(order_index, 1),
            'assignment_mode': _normalize_assignment_mode(assignment_mode),
            'mystery_group_title': _normalize_spaces(mystery_group_title),
            'mystery_title': _normalize_spaces(mystery_title),
            'is_active': True,
            'deleted_at_utc': '',
            'created_at_utc': now_iso,
            'updated_at_utc': now_iso,
        })
        return node_id

    mysteries_root_id = create_node(
        label=_read_portal_mystery_root_label(portal_content_file),
        order_index=1,
    )
    missa_root_id = create_node(label='Missa', order_index=2)
    create_node(label='Festival', order_index=3)
    create_node(label='Entrada', parent_id=missa_root_id, order_index=1)

    mystery_cards = _read_portal_mystery_cards(portal_content_file)
    if mystery_cards:
        for group_index, card in enumerate(mystery_cards, start=1):
            group_title = _normalize_spaces(str(card.get('title') or ''))
            group_id = create_node(
                label=group_title,
                parent_id=mysteries_root_id,
                order_index=group_index,
            )
            mystery_items = card.get('items')
            if not isinstance(mystery_items, list):
                continue
            for item_index, raw_item in enumerate(mystery_items, start=1):
                item_title = _normalize_spaces(str(raw_item))
                if not item_title:
                    continue
                create_node(
                    label=item_title,
                    parent_id=group_id,
                    order_index=item_index,
                    assignment_mode=_ASSIGNMENT_MODE_MYSTERY,
                    mystery_group_title=group_title,
                    mystery_title=item_title,
                )

    return {
        'last_id': next_id,
        'nodes': rows,
    }


def _read_store(
    file_path: Path,
    database_url: str | None = None,
    *,
    portal_content_file: Path | None = None,
) -> dict[str, object]:
    if database_url:
        database_store = load_store(database_url, _STORE_KEY)
        if database_store is not None:
            normalized = _normalize_store(database_store)
        else:
            normalized = _empty_store()
    else:
        if not file_path.exists():
            normalized = _empty_store()
        else:
            try:
                raw = json.loads(file_path.read_text(encoding='utf-8'))
            except json.JSONDecodeError as exc:
                raise RuntimeError(f'Arquivo de locais de musicas invalido: {file_path}') from exc
            except OSError as exc:
                raise RuntimeError(f'Falha ao ler arquivo de locais de musicas: {exc}') from exc
            normalized = _normalize_store(raw)

    if normalized.get('nodes'):
        if portal_content_file is not None:
            backfilled = _backfill_legacy_mystery_nodes(normalized, portal_content_file)
            if backfilled != normalized:
                _write_store(file_path, backfilled, database_url=database_url)
                normalized = backfilled
        return normalized

    if portal_content_file is None:
        return normalized

    default_store = _build_default_store(
        _coerce_int(normalized.get('last_id'), 0),
        portal_content_file,
    )
    _write_store(file_path, default_store, database_url=database_url)
    return _normalize_store(default_store)


def _write_store(file_path: Path, store: dict[str, object], database_url: str | None = None) -> None:
    normalized_store = _normalize_store(store)
    if database_url:
        save_store(database_url, _STORE_KEY, normalized_store)
        return

    file_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = file_path.with_suffix(f'{file_path.suffix}.tmp')
    payload = json.dumps(normalized_store, ensure_ascii=False, indent=2)
    try:
        temp_path.write_text(payload, encoding='utf-8')
        temp_path.replace(file_path)
    except OSError as exc:
        raise RuntimeError(f'Falha ao salvar arquivo de locais de musicas: {exc}') from exc
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


def _row_to_payload(row: dict[str, object]) -> dict[str, object]:
    return {
        'node_id': row.get('node_id') or '',
        'parent_id': row.get('parent_id') or '',
        'label': row.get('label') or '',
        'order_index': _coerce_int(row.get('order_index'), 0),
        'assignment_mode': row.get('assignment_mode') or _ASSIGNMENT_MODE_LOCATION,
        'mystery_group_title': row.get('mystery_group_title') or '',
        'mystery_title': row.get('mystery_title') or '',
        'is_active': _coerce_bool(row.get('is_active'), default=True),
        'deleted_at_utc': row.get('deleted_at_utc') or None,
        'created_at_utc': row.get('created_at_utc') or None,
        'updated_at_utc': row.get('updated_at_utc') or None,
    }


def _sort_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    sorted_rows = [
        _normalize_node_row(item)
        for item in rows
        if isinstance(item, dict)
    ]
    sorted_rows = [
        row
        for row in sorted_rows
        if row['node_id'] and row['label']
    ]
    sorted_rows.sort(
        key=lambda row: (
            str(row.get('parent_id') or ''),
            _coerce_int(row.get('order_index'), 0),
            str(row.get('label') or ''),
            str(row.get('node_id') or ''),
        )
    )
    return sorted_rows


def _build_tree(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    sorted_rows = _sort_rows(rows)
    nodes_by_id = {str(row.get('node_id') or ''): _row_to_payload(row) for row in sorted_rows}
    children_map: dict[str, list[str]] = {}
    root_ids: list[str] = []
    for row in sorted_rows:
        node_id = str(row.get('node_id') or '')
        parent_id = str(row.get('parent_id') or '')
        if not node_id:
            continue
        if parent_id and parent_id in nodes_by_id:
            children_map.setdefault(parent_id, []).append(node_id)
        else:
            root_ids.append(node_id)

    def build_node(node_id: str) -> dict[str, object]:
        base_payload = dict(nodes_by_id.get(node_id) or {})
        child_ids = children_map.get(node_id, [])
        children_payload = [build_node(child_id) for child_id in child_ids]
        base_payload['children'] = children_payload
        base_payload['has_children'] = bool(children_payload)
        return base_payload

    return [build_node(node_id) for node_id in root_ids]


def _find_row_index(rows: list[dict[str, object]], node_id: str) -> int:
    safe_node_id = _normalize_spaces(node_id)
    if not safe_node_id:
        return -1
    return next(
        (
            index
            for index, item in enumerate(rows)
            if isinstance(item, dict)
            and _normalize_spaces(str(item.get('node_id') or item.get('nodeId') or item.get('id') or '')) == safe_node_id
        ),
        -1,
    )


def _collect_descendant_ids(rows: list[dict[str, object]], parent_id: str) -> set[str]:
    safe_parent_id = _normalize_spaces(parent_id)
    if not safe_parent_id:
        return set()
    children_by_parent: dict[str, list[str]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        node_id = _normalize_spaces(str(row.get('node_id') or row.get('nodeId') or row.get('id') or ''))
        row_parent_id = _normalize_spaces(str(row.get('parent_id') or row.get('parentId') or ''))
        if not node_id:
            continue
        children_by_parent.setdefault(row_parent_id, []).append(node_id)

    descendants: set[str] = set()
    stack = [safe_parent_id]
    while stack:
        current_id = stack.pop()
        if current_id in descendants:
            continue
        descendants.add(current_id)
        stack.extend(children_by_parent.get(current_id, []))
    return descendants


def _collect_ancestor_ids(rows: list[dict[str, object]], node_id: str) -> set[str]:
    safe_node_id = _normalize_spaces(node_id)
    if not safe_node_id:
        return set()

    parent_by_id: dict[str, str] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        current_id = _normalize_spaces(str(row.get('node_id') or row.get('nodeId') or row.get('id') or ''))
        parent_id = _normalize_spaces(str(row.get('parent_id') or row.get('parentId') or ''))
        if current_id:
            parent_by_id[current_id] = parent_id

    ancestors: set[str] = set()
    cursor = safe_node_id
    while cursor:
        if cursor in ancestors:
            break
        ancestors.add(cursor)
        cursor = parent_by_id.get(cursor, '')
    return ancestors


def list_song_location_tree(
    locations_file: Path,
    portal_content_file: Path,
    include_inactive: bool = False,
    database_url: str | None = None,
) -> dict[str, object]:
    with _STORE_LOCK:
        store = _read_store(
            locations_file,
            database_url=database_url,
            portal_content_file=portal_content_file,
        )
        rows = store.get('nodes')
        node_rows = _sort_rows(rows if isinstance(rows, list) else [])
        visible_rows = node_rows if include_inactive else [
            row
            for row in node_rows
            if _coerce_bool(row.get('is_active'), default=True)
        ]

    return {
        'count': len(visible_rows),
        'nodes': [_row_to_payload(row) for row in visible_rows],
        'tree': _build_tree(visible_rows),
    }


def create_song_location_node(
    locations_file: Path,
    payload: SongLocationNodeCreateRequest,
    portal_content_file: Path,
    database_url: str | None = None,
) -> dict[str, object]:
    label = _normalize_spaces(payload.label)
    if not label:
        raise ValueError('Informe o nome da categoria/subcategoria.')

    parent_id = _normalize_spaces(payload.parent_id)
    now_iso = _now_utc_iso()
    saved_row: dict[str, object] = {}

    with _STORE_LOCK:
        store = _read_store(
            locations_file,
            database_url=database_url,
            portal_content_file=portal_content_file,
        )
        rows = store.get('nodes')
        node_rows = _sort_rows(rows if isinstance(rows, list) else [])
        if parent_id:
            parent_row = next(
                (
                    row
                    for row in node_rows
                    if str(row.get('node_id') or '') == parent_id
                ),
                None,
            )
            if not parent_row or not _coerce_bool(parent_row.get('is_active'), default=True):
                raise ValueError('Categoria pai nao encontrada.')

        sibling_rows = [
            row
            for row in node_rows
            if str(row.get('parent_id') or '') == parent_id
        ]
        requested_order = _coerce_int(payload.order_index, 0)
        if requested_order <= 0:
            requested_order = len(sibling_rows) + 1
        requested_order = min(max(requested_order, 1), len(sibling_rows) + 1)

        last_id = _coerce_int(store.get('last_id'), 0) + 1
        node_id = str(last_id)

        row = {
            'node_id': node_id,
            'parent_id': parent_id,
            'label': label,
            'order_index': requested_order,
            'assignment_mode': _ASSIGNMENT_MODE_LOCATION,
            'mystery_group_title': '',
            'mystery_title': '',
            'is_active': True,
            'deleted_at_utc': '',
            'created_at_utc': now_iso,
            'updated_at_utc': now_iso,
        }
        sibling_rows.append(row)
        sibling_rows.sort(
            key=lambda item: (
                _coerce_int(item.get('order_index'), 0),
                str(item.get('label') or ''),
                str(item.get('node_id') or ''),
            )
        )
        for index, item in enumerate(sibling_rows, start=1):
            item['order_index'] = index
            item['updated_at_utc'] = now_iso

        non_siblings = [
            item
            for item in node_rows
            if str(item.get('parent_id') or '') != parent_id
        ]
        next_rows = non_siblings + sibling_rows
        next_rows = _sort_rows(next_rows)

        store['last_id'] = last_id
        store['nodes'] = next_rows
        _write_store(locations_file, store, database_url=database_url)
        saved_row = row

    return _row_to_payload(saved_row)


def update_song_location_node(
    locations_file: Path,
    node_id: str,
    payload: SongLocationNodeUpdateRequest,
    portal_content_file: Path,
    database_url: str | None = None,
) -> dict[str, object]:
    safe_node_id = _normalize_spaces(node_id)
    if not safe_node_id:
        raise ValueError('Categoria/subcategoria invalida.')

    now_iso = _now_utc_iso()
    saved_row: dict[str, object] = {}

    with _STORE_LOCK:
        store = _read_store(
            locations_file,
            database_url=database_url,
            portal_content_file=portal_content_file,
        )
        rows = store.get('nodes')
        node_rows = _sort_rows(rows if isinstance(rows, list) else [])
        target_index = _find_row_index(node_rows, safe_node_id)
        if target_index < 0:
            raise ValueError('Categoria/subcategoria nao encontrada.')

        target_row = dict(node_rows[target_index])
        if not _coerce_bool(target_row.get('is_active'), default=True):
            raise ValueError('Categoria/subcategoria inativa. Restaure para editar.')
        descendants = _collect_descendant_ids(node_rows, safe_node_id)

        requested_parent = _normalize_spaces(payload.parent_id)
        if requested_parent == safe_node_id:
            raise ValueError('A categoria nao pode ser pai dela mesma.')
        if requested_parent and requested_parent in descendants:
            raise ValueError('Nao e permitido mover para um descendente.')
        if requested_parent:
            parent_exists = any(
                str(row.get('node_id') or '') == requested_parent
                and _coerce_bool(row.get('is_active'), default=True)
                for row in node_rows
            )
            if not parent_exists:
                raise ValueError('Categoria pai nao encontrada.')

        original_parent = str(target_row.get('parent_id') or '')
        next_parent = requested_parent or ''
        parent_changed = original_parent != next_parent

        next_label = _normalize_spaces(payload.label)
        if next_label:
            target_row['label'] = next_label

        next_assignment_mode = _normalize_assignment_mode(payload.assignment_mode)
        if payload.assignment_mode is not None:
            target_row['assignment_mode'] = next_assignment_mode
            if next_assignment_mode != _ASSIGNMENT_MODE_MYSTERY:
                target_row['mystery_group_title'] = ''
                target_row['mystery_title'] = ''

        if payload.mystery_group_title is not None:
            target_row['mystery_group_title'] = _normalize_spaces(payload.mystery_group_title)
        if payload.mystery_title is not None:
            target_row['mystery_title'] = _normalize_spaces(payload.mystery_title)

        if str(target_row.get('assignment_mode') or '') != _ASSIGNMENT_MODE_MYSTERY:
            target_row['mystery_group_title'] = ''
            target_row['mystery_title'] = ''

        target_row['parent_id'] = next_parent
        target_row['updated_at_utc'] = now_iso

        requested_order = _coerce_int(payload.order_index, 0)
        if requested_order <= 0:
            requested_order = _coerce_int(target_row.get('order_index'), 1)

        kept_rows = [
            item
            for index, item in enumerate(node_rows)
            if index != target_index
        ]

        sibling_rows = [
            dict(item)
            for item in kept_rows
            if str(item.get('parent_id') or '') == next_parent
        ]
        requested_order = min(max(requested_order, 1), len(sibling_rows) + 1)
        target_row['order_index'] = requested_order
        sibling_rows.append(target_row)
        sibling_rows.sort(
            key=lambda item: (
                _coerce_int(item.get('order_index'), 0),
                str(item.get('label') or ''),
                str(item.get('node_id') or ''),
            )
        )
        for index, item in enumerate(sibling_rows, start=1):
            item['order_index'] = index
            if parent_changed or str(item.get('node_id') or '') == safe_node_id:
                item['updated_at_utc'] = now_iso

        non_siblings = [
            item
            for item in kept_rows
            if str(item.get('parent_id') or '') != next_parent
        ]
        next_rows = _sort_rows(non_siblings + sibling_rows)
        store['nodes'] = next_rows
        _write_store(locations_file, store, database_url=database_url)
        saved_row = target_row

    return _row_to_payload(saved_row)


def delete_song_location_node(
    locations_file: Path,
    node_id: str,
    portal_content_file: Path,
    database_url: str | None = None,
) -> dict[str, object]:
    safe_node_id = _normalize_spaces(node_id)
    if not safe_node_id:
        raise ValueError('Categoria/subcategoria invalida.')

    with _STORE_LOCK:
        store = _read_store(
            locations_file,
            database_url=database_url,
            portal_content_file=portal_content_file,
        )
        rows = store.get('nodes')
        node_rows = _sort_rows(rows if isinstance(rows, list) else [])
        target_index = _find_row_index(node_rows, safe_node_id)
        if target_index < 0:
            raise ValueError('Categoria/subcategoria nao encontrada.')

        now_iso = _now_utc_iso()
        ids_to_deactivate = _collect_descendant_ids(node_rows, safe_node_id)
        changed_ids: list[str] = []
        for row in node_rows:
            current_id = str(row.get('node_id') or '')
            if current_id not in ids_to_deactivate:
                continue
            if not _coerce_bool(row.get('is_active'), default=True):
                continue
            row['is_active'] = False
            row['deleted_at_utc'] = now_iso
            row['updated_at_utc'] = now_iso
            changed_ids.append(current_id)

        store['nodes'] = _sort_rows(node_rows)
        _write_store(locations_file, store, database_url=database_url)

    return {
        'removed': bool(changed_ids),
        'removed_ids': sorted(changed_ids),
        'count': len(changed_ids),
        'soft_deleted': True,
    }


def hard_delete_song_location_node(
    locations_file: Path,
    node_id: str,
    portal_content_file: Path,
    database_url: str | None = None,
) -> dict[str, object]:
    safe_node_id = _normalize_spaces(node_id)
    if not safe_node_id:
        raise ValueError('Categoria/subcategoria invalida.')

    with _STORE_LOCK:
        store = _read_store(
            locations_file,
            database_url=database_url,
            portal_content_file=portal_content_file,
        )
        rows = store.get('nodes')
        node_rows = _sort_rows(rows if isinstance(rows, list) else [])
        target_index = _find_row_index(node_rows, safe_node_id)
        if target_index < 0:
            raise ValueError('Categoria/subcategoria nao encontrada.')

        ids_to_remove = _collect_descendant_ids(node_rows, safe_node_id)
        remaining_rows = [
            row
            for row in node_rows
            if str(row.get('node_id') or '') not in ids_to_remove
        ]

        now_iso = _now_utc_iso()
        by_parent: dict[str, list[dict[str, object]]] = {}
        for row in remaining_rows:
            parent_id = str(row.get('parent_id') or '')
            by_parent.setdefault(parent_id, []).append(row)

        reindexed_rows: list[dict[str, object]] = []
        for siblings in by_parent.values():
            siblings.sort(
                key=lambda item: (
                    _coerce_int(item.get('order_index'), 0),
                    str(item.get('label') or ''),
                    str(item.get('node_id') or ''),
                )
            )
            for index, sibling in enumerate(siblings, start=1):
                sibling['order_index'] = index
                sibling['updated_at_utc'] = now_iso
                reindexed_rows.append(sibling)

        store['nodes'] = _sort_rows(reindexed_rows)
        _write_store(locations_file, store, database_url=database_url)

    removed_ids = sorted(ids_to_remove)
    return {
        'removed': bool(removed_ids),
        'removed_ids': removed_ids,
        'count': len(removed_ids),
        'soft_deleted': False,
        'hard_deleted': True,
    }


def restore_song_location_node(
    locations_file: Path,
    node_id: str,
    portal_content_file: Path,
    database_url: str | None = None,
) -> dict[str, object]:
    safe_node_id = _normalize_spaces(node_id)
    if not safe_node_id:
        raise ValueError('Categoria/subcategoria invalida.')

    with _STORE_LOCK:
        store = _read_store(
            locations_file,
            database_url=database_url,
            portal_content_file=portal_content_file,
        )
        rows = store.get('nodes')
        node_rows = _sort_rows(rows if isinstance(rows, list) else [])
        target_index = _find_row_index(node_rows, safe_node_id)
        if target_index < 0:
            raise ValueError('Categoria/subcategoria nao encontrada.')

        now_iso = _now_utc_iso()
        ids_to_restore = _collect_descendant_ids(node_rows, safe_node_id) | _collect_ancestor_ids(node_rows, safe_node_id)
        restored_ids: list[str] = []
        for row in node_rows:
            current_id = str(row.get('node_id') or '')
            if current_id not in ids_to_restore:
                continue
            if _coerce_bool(row.get('is_active'), default=True):
                continue
            row['is_active'] = True
            row['deleted_at_utc'] = ''
            row['updated_at_utc'] = now_iso
            restored_ids.append(current_id)

        store['nodes'] = _sort_rows(node_rows)
        _write_store(locations_file, store, database_url=database_url)

    return {
        'restored': bool(restored_ids),
        'restored_ids': sorted(restored_ids),
        'count': len(restored_ids),
    }


def reorder_song_location_nodes(
    locations_file: Path,
    payload: SongLocationNodeReorderRequest,
    portal_content_file: Path,
    database_url: str | None = None,
) -> list[dict[str, object]]:
    parent_id = _normalize_spaces(payload.parent_id)
    ordered_ids: list[str] = []
    seen_ids: set[str] = set()
    for raw_id in payload.ordered_ids:
        node_id = _normalize_spaces(str(raw_id))
        if not node_id:
            raise ValueError('Lista de ordenacao invalida.')
        if node_id in seen_ids:
            raise ValueError('Lista de ordenacao invalida.')
        seen_ids.add(node_id)
        ordered_ids.append(node_id)

    reordered_rows: list[dict[str, object]] = []

    with _STORE_LOCK:
        store = _read_store(
            locations_file,
            database_url=database_url,
            portal_content_file=portal_content_file,
        )
        rows = store.get('nodes')
        node_rows = _sort_rows(rows if isinstance(rows, list) else [])

        siblings = [
            row
            for row in node_rows
            if str(row.get('parent_id') or '') == parent_id
        ]
        sibling_ids = [str(row.get('node_id') or '') for row in siblings]
        if any(node_id not in sibling_ids for node_id in ordered_ids):
            raise ValueError('Categoria/subcategoria nao encontrada para reordenar.')

        current_order = [node_id for node_id in sibling_ids if node_id not in seen_ids]
        final_order = ordered_ids + current_order
        sibling_by_id = {
            str(row.get('node_id') or ''): row
            for row in siblings
        }
        now_iso = _now_utc_iso()
        for index, node_id in enumerate(final_order, start=1):
            row = sibling_by_id.get(node_id)
            if not row:
                continue
            row['order_index'] = index
            row['updated_at_utc'] = now_iso

        store['nodes'] = _sort_rows(node_rows)
        _write_store(locations_file, store, database_url=database_url)

        reordered_rows = [
            row
            for row in store['nodes']
            if str(row.get('parent_id') or '') == parent_id
        ]

    return [_row_to_payload(row) for row in _sort_rows(reordered_rows)]

