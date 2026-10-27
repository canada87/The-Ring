from typing import Optional

from . import config, mailer
from .ntfy import send_ntfy

CHANNELS = ("ntfy", "email")


def channel_of(settings: dict) -> str:
    channel = settings.get("notification_channel")
    return channel if channel in CHANNELS else "ntfy"


def not_ready_reason(settings: dict) -> Optional[str]:
    """Why the selected channel can't send right now, or None if it can."""
    if channel_of(settings) == "email":
        if not mailer.is_configured():
            return "Server SMTP non configurato (variabili RING_SMTP_*)."
        if not settings.get("email_to"):
            return "Indirizzo email non configurato."
        return None
    if not (settings.get("ntfy_server") or config.DEFAULT_NTFY_SERVER):
        return "Server ntfy non configurato."
    if not settings.get("ntfy_topic"):
        return "Topic ntfy non configurato."
    return None


async def send_notification(
    settings: dict,
    title: str,
    message: str,
    priority: str = "default",
    tags: Optional[list[str]] = None,
) -> None:
    if channel_of(settings) == "email":
        await mailer.send_email(settings["email_to"], title, message)
        return
    server = settings.get("ntfy_server") or config.DEFAULT_NTFY_SERVER
    await send_ntfy(server, settings["ntfy_topic"], title, message, priority=priority, tags=tags)
