from __future__ import annotations

from datetime import datetime, timezone

from psycopg import connect
from psycopg.errors import OperationalError


def ping_database(database_url: str | None) -> dict[str, object]:
    if not database_url:
        return {
            'ok': False,
            'message': 'DATABASE_URL nao configurada.',
        }

    try:
        with connect(database_url, connect_timeout=6) as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT NOW()::timestamptz, current_database();')
                row = cur.fetchone()

        server_time = row[0].astimezone(timezone.utc).isoformat() if row else None
        database_name = row[1] if row else None

        return {
            'ok': True,
            'database': database_name,
            'server_time_utc': server_time,
            'checked_at_utc': datetime.now(timezone.utc).isoformat(),
        }
    except OperationalError as exc:
        return {
            'ok': False,
            'message': f'Falha ao conectar no PostgreSQL: {exc}',
        }
    except Exception as exc:  # pragma: no cover - defensive fallback
        return {
            'ok': False,
            'message': f'Erro inesperado ao validar conexao: {exc}',
        }
