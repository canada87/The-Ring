import logging
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import logic, mailer, notify
from .db import get_connection, init_db
from .scheduler import create_scheduler

logging.basicConfig(level=logging.INFO)

scheduler = create_scheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="The Ring", lifespan=lifespan)


class RingActionRequest(BaseModel):
    type: Literal["insert", "remove"]
    at: Optional[str] = None


class EventEditRequest(BaseModel):
    at: str


class SettingsUpdateRequest(BaseModel):
    ntfy_server: Optional[str] = None
    ntfy_topic: Optional[str] = None
    notifications_enabled: Optional[bool] = None
    notification_channel: Optional[Literal["ntfy", "email"]] = None
    email_to: Optional[str] = None


def _public_settings(conn) -> dict:
    settings = logic.get_settings(conn)
    settings["notifications_enabled"] = settings.get("notifications_enabled") == "1"
    settings["notification_channel"] = notify.channel_of(settings)
    settings["email_configured"] = mailer.is_configured()
    return settings


@app.get("/api/status")
def api_status():
    conn = get_connection()
    try:
        return logic.compute_status(conn)
    finally:
        conn.close()


@app.get("/api/history")
def api_history(limit: int = 50):
    conn = get_connection()
    try:
        rows = logic.get_history(conn, limit=limit)
        return [dict(row) for row in rows]
    finally:
        conn.close()


@app.post("/api/ring/action")
def api_ring_action(body: RingActionRequest):
    conn = get_connection()
    try:
        status = logic.compute_status(conn)
        is_setup = status["phase"] == "setup_required"

        if not is_setup:
            expected_action = status["next_action"]
            if body.type != expected_action:
                raise HTTPException(
                    status_code=409,
                    detail=f"Azione non valida: al momento è previsto '{expected_action}'.",
                )
        elif body.type != "insert":
            raise HTTPException(
                status_code=409,
                detail="Al primo utilizzo devi registrare l'inserimento dell'anello.",
            )

        event_id = logic.add_event(conn, body.type, at=body.at)
        return {"id": event_id, "status": logic.compute_status(conn)}
    finally:
        conn.close()


@app.delete("/api/history/{event_id}")
def api_delete_event(event_id: int):
    conn = get_connection()
    try:
        ok = logic.delete_last_event(conn, event_id)
        if not ok:
            raise HTTPException(
                status_code=409,
                detail="Puoi annullare solo l'ultimo evento registrato.",
            )
        return {"status": logic.compute_status(conn)}
    finally:
        conn.close()


@app.patch("/api/history/{event_id}")
def api_edit_event(event_id: int, body: EventEditRequest):
    conn = get_connection()
    try:
        ok, error = logic.edit_event(conn, event_id, body.at)
        if not ok:
            raise HTTPException(status_code=409, detail=error)
        return {"status": logic.compute_status(conn)}
    finally:
        conn.close()


@app.get("/api/settings")
def api_get_settings():
    conn = get_connection()
    try:
        return _public_settings(conn)
    finally:
        conn.close()


@app.put("/api/settings")
def api_update_settings(body: SettingsUpdateRequest):
    conn = get_connection()
    try:
        values = {}
        if body.ntfy_server is not None:
            values["ntfy_server"] = body.ntfy_server.strip()
        if body.ntfy_topic is not None:
            values["ntfy_topic"] = body.ntfy_topic.strip()
        if body.notifications_enabled is not None:
            values["notifications_enabled"] = "1" if body.notifications_enabled else "0"
        if body.notification_channel is not None:
            values["notification_channel"] = body.notification_channel
        if body.email_to is not None:
            try:
                recipients = mailer.parse_recipients(body.email_to)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            values["email_to"] = ", ".join(recipients)
        logic.update_settings(conn, values)
        return _public_settings(conn)
    finally:
        conn.close()


@app.post("/api/settings/test-notification")
async def api_test_notification():
    conn = get_connection()
    try:
        settings = logic.get_settings(conn)
    finally:
        conn.close()

    reason = notify.not_ready_reason(settings)
    if reason:
        raise HTTPException(status_code=400, detail=reason)

    try:
        await notify.send_notification(
            settings,
            "Test - The Ring",
            "Se leggi questo messaggio, le notifiche funzionano correttamente.",
            priority="default",
            tags=["ring", "test"],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Invio fallito: {exc}") from exc

    return {"ok": True}


app.mount("/", StaticFiles(directory="static", html=True), name="static")
