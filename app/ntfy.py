import logging
from typing import Optional

import httpx

logger = logging.getLogger("ring.ntfy")

# ntfy's JSON publish API requires priority as an integer 1-5, not a label.
PRIORITY_LEVELS = {"min": 1, "low": 2, "default": 3, "high": 4, "max": 5}


async def send_ntfy(
    server: str,
    topic: str,
    title: str,
    message: str,
    priority: str = "default",
    tags: Optional[list[str]] = None,
) -> None:
    url = server.rstrip("/") + "/"
    payload = {
        "topic": topic,
        "title": title,
        "message": message,
        "priority": PRIORITY_LEVELS.get(priority, 3),
    }
    if tags:
        payload["tags"] = tags

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        logger.info("ntfy sent: %s -> %s", title, url)
