import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from . import config, logic, notify
from .db import get_connection, parse_iso

logger = logging.getLogger("ring.scheduler")

ACTION_LABEL = {
    "remove": "togliere l'anello",
    "insert": "inserire il nuovo anello",
}


def _plural_days(n: int) -> str:
    return "giorno" if n == 1 else "giorni"


def _format_overdue(delta: timedelta) -> str:
    total_hours = int(delta.total_seconds() // 3600)
    if total_hours < 24:
        return f"{total_hours} ore" if total_hours != 1 else "1 ora"
    days = total_hours // 24
    return f"{days} {_plural_days(days)}"


async def check_and_notify() -> None:
    conn = get_connection()
    try:
        settings = logic.get_settings(conn)
        if settings.get("notifications_enabled") != "1":
            return

        if notify.not_ready_reason(settings):
            return

        status = logic.compute_status(conn)
        if status["phase"] == "setup_required":
            return

        now = datetime.now(timezone.utc)
        due_at = parse_iso(status["due_at"])
        cycle_event_id = status["cycle_event_id"]
        action_label = ACTION_LABEL[status["next_action"]]
        remaining = due_at - now

        if remaining.total_seconds() > 0:
            for days_before in config.REMINDER_DAYS_BEFORE:
                kind = f"due_{days_before}d"
                if remaining <= timedelta(days=days_before) and not logic.already_notified(
                    conn, cycle_event_id, kind
                ):
                    title = "Promemoria anello"
                    verb = "Manca" if days_before == 1 else "Mancano"
                    message = (
                        f"{verb} {days_before} {_plural_days(days_before)} per "
                        f"{action_label}."
                    )
                    await notify.send_notification(
                        settings, title, message, priority="default", tags=["ring"]
                    )
                    logic.log_notification(conn, cycle_event_id, kind)
        else:
            last_overtime = logic.last_notification_at(conn, cycle_event_id, "overtime")
            interval = timedelta(hours=config.OVERTIME_INTERVAL_HOURS)
            if last_overtime is None or (now - last_overtime) >= interval:
                overdue = now - due_at
                title = "Anello in ritardo"
                message = f"E' in ritardo da {_format_overdue(overdue)}: {action_label}!"
                await notify.send_notification(
                    settings, title, message, priority="high", tags=["warning", "ring"]
                )
                logic.log_notification(conn, cycle_event_id, "overtime")
    except Exception:
        logger.exception("check_and_notify failed")
    finally:
        conn.close()


def create_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=config.TIMEZONE)
    scheduler.add_job(
        check_and_notify,
        "interval",
        minutes=config.SCHEDULER_INTERVAL_MINUTES,
        id="check_and_notify",
        next_run_time=datetime.now(),
    )
    return scheduler
