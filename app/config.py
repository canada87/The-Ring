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
