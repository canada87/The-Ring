import asyncio
import logging
import re
import smtplib
import ssl
from email.message import EmailMessage

from . import config

logger = logging.getLogger("ring.mailer")

MAX_RECIPIENTS = 10
# Deliberately strict: one plain address, no display names, quotes or whitespace.
_ADDRESS_RE = re.compile(r"^[^@\s,;<>\"]+@[^@\s,;<>\"]+\.[^@\s,;<>\"]+$")


def parse_recipients(raw: str) -> list[str]:
    """Split a comma/semicolon separated list into validated, de-duplicated addresses.

    Raises ValueError with a user-facing message on the first problem.
    """
    recipients: list[str] = []
    for part in re.split(r"[,;]", raw):
        address = part.strip()
        if not address:
            continue
        if not _ADDRESS_RE.match(address):
            raise ValueError(f"Indirizzo email non valido: {address[:60]}")
        if address.lower() not in (r.lower() for r in recipients):
            recipients.append(address)
    if len(recipients) > MAX_RECIPIENTS:
        raise ValueError(f"Troppi indirizzi (massimo {MAX_RECIPIENTS}).")
    return recipients


def parse_recipients_safe(raw: str) -> list[str]:
    """Like parse_recipients but returns [] for a value that doesn't validate."""
    try:
        return parse_recipients(raw or "")
    except ValueError:
        return []


def is_configured() -> bool:
    return bool(config.SMTP_HOST and config.SMTP_FROM)


def _send_sync(to: list[str], subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = config.SMTP_FROM
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.set_content(body)

    if config.SMTP_SECURITY == "ssl":
        smtp = smtplib.SMTP_SSL(
            config.SMTP_HOST, config.SMTP_PORT, timeout=15, context=ssl.create_default_context()
        )
    else:
        smtp = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15)

    with smtp:
        if config.SMTP_SECURITY == "starttls":
            smtp.starttls(context=ssl.create_default_context())
        if config.SMTP_USER:
            smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
        smtp.send_message(msg, to_addrs=to)


async def send_email(to: list[str], subject: str, body: str) -> None:
    await asyncio.to_thread(_send_sync, to, subject, body)
    logger.info("email sent: %s -> %s", subject, ", ".join(to))
