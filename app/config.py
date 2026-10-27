import os
from pathlib import Path

DB_PATH = Path(os.environ.get("RING_DB_PATH", "/data/ring.db"))
TIMEZONE = os.environ.get("RING_TZ", "Europe/Rome")

WEAR_DAYS = 21
REST_DAYS = 7

# (timedelta in days before the due date, notification kind key)
REMINDER_DAYS_BEFORE = [2, 1]
OVERTIME_INTERVAL_HOURS = 6
SCHEDULER_INTERVAL_MINUTES = 15

DEFAULT_NTFY_SERVER = "https://ntfy.sh"

# SMTP credentials live in the environment only: the app has no auth, so they
# must never be stored in the DB or returned by the settings API.
SMTP_HOST = os.environ.get("RING_SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("RING_SMTP_PORT", "587"))
SMTP_USER = os.environ.get("RING_SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("RING_SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("RING_SMTP_FROM", "") or SMTP_USER
# "starttls" (port 587), "ssl" (port 465) or "none"
SMTP_SECURITY = os.environ.get("RING_SMTP_SECURITY", "starttls").lower()
