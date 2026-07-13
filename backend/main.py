"""
Entry point. Wires up all routers, creates DB tables on startup (fine for
POC -- use Alembic migrations if this grows past the POC), pre-warms Ollama.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app import models  # noqa: F401 -- ensures models are registered before create_all
from app.ai_client import prewarm
from app.routers import (
    auth, employees, hrms_sync, onboarding, offboarding,
    access, assets, approvals, reports, audit, dashboard, profile, insights,
)

app = FastAPI(title="Onboarding/Offboarding POC API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(hrms_sync.router)
app.include_router(onboarding.router)
app.include_router(offboarding.router)
app.include_router(access.router)
app.include_router(assets.router)
app.include_router(approvals.router)
app.include_router(reports.router)
app.include_router(audit.router)
app.include_router(dashboard.router)
app.include_router(profile.router)
app.include_router(insights.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    prewarm()


@app.get("/")
def health():
    return {"status": "backend running"}
