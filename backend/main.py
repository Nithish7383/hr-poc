"""
Entry point. Wires up all routers, creates DB tables on startup (fine for
POC -- use Alembic migrations if this grows past the POC), pre-warms Ollama.
"""
from dotenv import load_dotenv
load_dotenv()

import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models import DocumentRequestEmail, FeedbackEmail
from app.database import Base, engine, SessionLocal
from app import models  # noqa: F401 -- ensures models are registered before create_all
from app.ai_client import prewarm
from app.routers.onboarding import check_inbox_for_employee, check_feedback_inbox
from app.services.reminders import send_document_reminders, escalate_overdue_tasks
from app.routers import (
    auth, employees, hrms_sync, onboarding, offboarding,
    approvals, reports, audit, dashboard, profile, insights,
    decisions, compliance,
    auth,
    employees,
    hrms_sync,
    onboarding,
    offboarding,
    access,
    assets,
    approvals,
    reports,
    audit,
    dashboard,
    profile,
    insights,
    hr_assistant,   # <-- NEW
    licenses,
)

app = FastAPI(title="Onboarding/Offboarding POC API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Existing Routers
app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(hrms_sync.router)
app.include_router(onboarding.router)
app.include_router(offboarding.router)
app.include_router(approvals.router)
app.include_router(reports.router)
app.include_router(audit.router)
app.include_router(dashboard.router)
app.include_router(profile.router)
app.include_router(insights.router)
app.include_router(decisions.router)
app.include_router(compliance.router)
app.include_router(licenses.router)

# HR Assistant Router
app.include_router(hr_assistant.router)

POLL_INTERVAL_SECONDS = 60
SWEEP_INTERVAL_SECONDS = 300  # reminders/escalation don't need 60s granularity -- checked every 5 min

async def _poll_inboxes_loop():
    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        db = SessionLocal()
        try:
            awaiting = db.query(DocumentRequestEmail).filter(DocumentRequestEmail.status == "sent").all()
            for record in awaiting:
                try:
                    check_inbox_for_employee(record.employee_id, db)
                except Exception as e:
                    print(f"[INBOX POLL] Error checking employee {record.employee_id}: {e}")

            awaiting_feedback = db.query(FeedbackEmail).filter(FeedbackEmail.status == "sent").all()
            for record in awaiting_feedback:
                try:
                    check_feedback_inbox(record.employee_id, db)
                except Exception as e:
                    print(f"[FEEDBACK POLL] Error checking employee {record.employee_id}: {e}")
        finally:
            db.close()


async def _reminder_escalation_loop():
    while True:
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
        db = SessionLocal()
        try:
            try:
                send_document_reminders(db)
            except Exception as e:
                print(f"[REMINDER SWEEP] Error: {e}")
            try:
                escalate_overdue_tasks(db)
            except Exception as e:
                print(f"[ESCALATION SWEEP] Error: {e}")
        finally:
            db.close()


@app.on_event("startup")
def on_startup():
    """
    Create database tables and warm up Ollama.
    """
    Base.metadata.create_all(bind=engine)
    prewarm()
    asyncio.create_task(_poll_inboxes_loop())
    asyncio.create_task(_reminder_escalation_loop())


@app.get("/")
def health():
    return {
        "status": "backend running",
        "service": "HR Onboarding/Offboarding POC",
        "hr_assistant": "available"
    }