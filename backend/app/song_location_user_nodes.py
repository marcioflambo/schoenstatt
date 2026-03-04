from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from .json_store_db import load_store, save_store
from .song_locations import SongLocationNodeCreateRequest

_STORE_LOCK = RLock()
_STORE_KEY = 'song_location_user_nodes'


def _normalize_spaces(value: str | None) -> str:
    return ' '.join((value or '').split()).strip()


def _coerce_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_bool(value: object, default: bool = True) -> bool:
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

    return {
        'node_id': node_id,
        'parent_id': parent_id,
        'label': label,
        'order_index': max(
            _coerce_int(raw_row.get('order_index') or raw_row.get('orderIndex'), 0),
            1,
        ),
        'assignment_mode': 'location',
        'mystery_group_title': '',
        'mystery_title': '',
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

        numeric_suffix = ''.join(char for char in node_id if char.isdigit())
        if numeric_suffix:
            max_id = max(max_id, _coerce_int(numeric_suffix, 0))

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


def _resolve_store_key(store_namespace: str | None) -> str:
    safe_namespace = _normalize_spaces(store_namespace)
    return f'{_STORE_KEY}:{safe_namespace}' if safe_namespace else _STORE_KEY


def _resolve_namespace_file(base_file_path: Path, store_namespace: str | None) -> Path:
    safe_namespace = _normalize_spaces(store_namespace)
    if not safe_namespace:
        return base_file_path
    safe_token = ''.join(char if char.isalnum() or char in {'-', '_'} else '_' for char in safe_namespace)
    safe_token = safe_token.strip('_') or 'default'
    return base_file_path.parent / 'song_location_user_nodes' / f'{safe_token}.json'


def _read_store(
    base_file_path: Path,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> dict[str, object]:
    if database_url:
        database_store = load_store(database_url, _resolve_store_key(store_namespace))
        if database_store is not None:
            return _normalize_store(database_store)
        return _empty_store()

    file_path = _resolve_namespace_file(base_file_path, store_namespace)
    if not file_path.exists():
        return _empty_store()

    try:
        raw = json.loads(file_path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'Arquivo de locais por usuario invalido: {file_path}') from exc
    except OSError as exc:
        raise RuntimeError(f'Falha ao ler arquivo de locais por usuario: {exc}') from exc

    return _normalize_store(raw)


def _write_store(
    base_file_path: Path,
    store: dict[str, object],
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> None:
    normalized_store = _normalize_store(store)
    if database_url:
        save_store(database_url, _resolve_store_key(store_namespace), normalized_store)
        return

    file_path = _resolve_namespace_file(base_file_path, store_namespace)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = file_path.with_suffix(f'{file_path.suffix}.tmp')
    payload = json.dumps(normalized_store, ensure_ascii=False, indent=2)
    try:
        temp_path.write_text(payload, encoding='utf-8')
        temp_path.replace(file_path)
    except OSError as exc:
        raise RuntimeError(f'Falha ao salvar arquivo de locais por usuario: {exc}') from exc
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
        'assignment_mode': 'location',
        'mystery_group_title': '',
        'mystery_title': '',
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


def list_song_location_user_nodes(
    base_file_path: Path,
    *,
    include_inactive: bool = False,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> list[dict[str, object]]:
    with _STORE_LOCK:
        store = _read_store(
            base_file_path,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('nodes')
        node_rows = _sort_rows(rows if isinstance(rows, list) else [])

    visible_rows = node_rows if include_inactive else [
        row
        for row in node_rows
        if _coerce_bool(row.get('is_active'), default=True)
    ]
    return [_row_to_payload(row) for row in visible_rows]


def create_song_location_user_node(
    base_file_path: Path,
    payload: SongLocationNodeCreateRequest,
    *,
    valid_parent_ids: set[str] | None = None,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> dict[str, object]:
    label = _normalize_spaces(payload.label)
    if not label:
        raise ValueError('Informe o nome da categoria/subcategoria.')

    parent_id = _normalize_spaces(payload.parent_id)
    if parent_id and isinstance(valid_parent_ids, set) and parent_id not in valid_parent_ids:
        raise ValueError('Categoria pai nao encontrada.')

    now_iso = _now_utc_iso()
    saved_row: dict[str, object] = {}

    with _STORE_LOCK:
        store = _read_store(
            base_file_path,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('nodes')
        node_rows = _sort_rows(rows if isinstance(rows, list) else [])

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
        node_id = f'u{last_id}'

        row = {
            'node_id': node_id,
            'parent_id': parent_id,
            'label': label,
            'order_index': requested_order,
            'assignment_mode': 'location',
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
        next_rows = _sort_rows(non_siblings + sibling_rows)

        store['last_id'] = last_id
        store['nodes'] = next_rows
        _write_store(
            base_file_path,
            store,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        saved_row = row

    return _row_to_payload(saved_row)


def _collect_descendant_node_ids(
    rows: list[dict[str, object]],
    root_node_id: str,
) -> set[str]:
    safe_root_id = _normalize_spaces(root_node_id)
    if not safe_root_id:
        return set()

    children_by_parent: dict[str, set[str]] = {}
    for row in rows:
        node_id = _normalize_spaces(str(row.get('node_id') or ''))
        parent_id = _normalize_spaces(str(row.get('parent_id') or ''))
        if not node_id:
            continue
        children_by_parent.setdefault(parent_id, set()).add(node_id)

    collected: set[str] = set()
    stack: list[str] = [safe_root_id]
    while stack:
        current = _normalize_spaces(stack.pop())
        if not current or current in collected:
            continue
        collected.add(current)
        for child_id in children_by_parent.get(current, set()):
            if child_id not in collected:
                stack.append(child_id)
    return collected


def delete_song_location_user_node(
    base_file_path: Path,
    node_id: str,
    *,
    database_url: str | None = None,
    store_namespace: str | None = None,
) -> dict[str, object]:
    safe_node_id = _normalize_spaces(node_id)
    if not safe_node_id:
        raise ValueError('Informe a categoria/subcategoria.')
    if not safe_node_id.lower().startswith('u'):
        raise ValueError('Categoria/subcategoria nao encontrada.')

    with _STORE_LOCK:
        store = _read_store(
            base_file_path,
            database_url=database_url,
            store_namespace=store_namespace,
        )
        rows = store.get('nodes')
        node_rows = _sort_rows(rows if isinstance(rows, list) else [])

        has_target = any(
            _normalize_spaces(str(row.get('node_id') or '')) == safe_node_id
            for row in node_rows
        )
        if not has_target:
            raise ValueError('Categoria/subcategoria nao encontrada.')

        removed_ids = _collect_descendant_node_ids(node_rows, safe_node_id)
        kept_rows = [
            row
            for row in node_rows
            if _normalize_spaces(str(row.get('node_id') or '')) not in removed_ids
        ]

        store['nodes'] = _sort_rows(kept_rows)
        _write_store(
            base_file_path,
            store,
            database_url=database_url,
            store_namespace=store_namespace,
        )

    removed_ids_list = sorted(removed_ids)
    return {
        'removed': bool(removed_ids_list),
        'count': len(removed_ids_list),
        'removed_node_ids': removed_ids_list,
    }
