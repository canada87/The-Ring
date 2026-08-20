import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional

from . import config
from .db import now_iso, parse_iso


def get_last_event(conn: sqlite3.Connection) -> Optional[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM events ORDER BY at DESC, id DESC LIMIT 1"
    ).fetchone()


def compute_status(conn: sqlite3.Connection) -> dict:
    last = get_last_event(conn)
    now = datetime.now(timezone.utc)

    if last is None:
        return {
            "phase": "setup_required",
            "now": now.isoformat(),
        }

    started_at = parse_iso(last["at"])
    if last["type"] == "insert":
        phase = "wearing"
        next_action = "remove"
        due_at = started_at + timedelta(days=config.WEAR_DAYS)
        cycle_length_days = config.WEAR_DAYS
    else:
        phase = "resting"
        next_action = "insert"
        due_at = started_at + timedelta(days=config.REST_DAYS)
        cycle_length_days = config.REST_DAYS

    overtime = now > due_at

    return {
        "phase": phase,
        "next_action": next_action,
        "cycle_event_id": last["id"],
        "cycle_started_at": started_at.isoformat(),
        "due_at": due_at.isoformat(),
        "cycle_length_days": cycle_length_days,
        "now": now.isoformat(),
        "overtime": overtime,
        "wear_days": config.WEAR_DAYS,
        "rest_days": config.REST_DAYS,
    }


def add_event(conn: sqlite3.Connection, event_type: str, at: Optional[str] = None) -> int:
    at = at or now_iso()
    cur = conn.execute(
        "INSERT INTO events (type, at) VALUES (?, ?)", (event_type, at)
    )
    conn.commit()
    return cur.lastrowid


def get_history(conn: sqlite3.Connection, limit: int = 50) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM events ORDER BY at DESC, id DESC LIMIT ?", (limit,)
    ).fetchall()


def delete_last_event(conn: sqlite3.Connection, event_id: int) -> bool:
    last = get_last_event(conn)
    if last is None or last["id"] != event_id:
        return False
    conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.execute("DELETE FROM notification_log WHERE cycle_event_id = ?", (event_id,))
    conn.commit()
    return True


def get_settings(conn: sqlite3.Connection) -> dict:
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    return {row["key"]: row["value"] for row in rows}


def update_settings(conn: sqlite3.Connection, values: dict) -> None:
    for key, value in values.items():
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
    conn.commit()


def already_notified(conn: sqlite3.Connection, cycle_event_id: int, kind: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM notification_log WHERE cycle_event_id = ? AND kind = ? LIMIT 1",
        (cycle_event_id, kind),
    ).fetchone()
    return row is not None


def last_notification_at(
    conn: sqlite3.Connection, cycle_event_id: int, kind: str
) -> Optional[datetime]:
    row = conn.execute(
        "SELECT sent_at FROM notification_log WHERE cycle_event_id = ? AND kind = ? "
        "ORDER BY sent_at DESC LIMIT 1",
        (cycle_event_id, kind),
    ).fetchone()
    return parse_iso(row["sent_at"]) if row else None


def log_notification(conn: sqlite3.Connection, cycle_event_id: int, kind: str) -> None:
    conn.execute(
        "INSERT INTO notification_log (cycle_event_id, kind, sent_at) VALUES (?, ?, ?)",
        (cycle_event_id, kind, now_iso()),
    )
    conn.commit()
