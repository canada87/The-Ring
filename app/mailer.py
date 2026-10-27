import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage

from . import config

logger = logging.getLogger("ring.mailer")


def is_configured() -> bool:
    return bool(config.SMTP_HOST and config.SMTP_FROM)


def _send_sync(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = config.SMTP_FROM
    msg["To"] = to
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
        smtp.send_message(msg)


async def send_email(to: str, subject: str, body: str) -> None:
    await asyncio.to_thread(_send_sync, to, subject, body)
    logger.info("email sent: %s -> %s", subject, to)
