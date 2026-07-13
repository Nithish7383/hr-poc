"""
Computes track and employee onboarding completion LIVE from OnboardingTask
rows -- never cached or stored, so there's nothing that can drift out of
sync with reality (see the earlier hardcoded-step-count bug for exactly
why that matters).

A track is "completed" only when every MANDATORY task in it is approved.
Employee onboarding completes only when every track has completed.
"""
from sqlalchemy.orm import Session
from app.models import OnboardingTask, Employee
import datetime

TRACKS = ["HR", "IT", "Security", "Manager"]


def get_track_status(db: Session, employee_id: str, track: str) -> str:
    tasks = db.query(OnboardingTask).filter(
        OnboardingTask.employee_id == employee_id, OnboardingTask.track == track
    ).all()
    if not tasks:
        return "not_started"

    mandatory = [t for t in tasks if t.is_mandatory]
    if not mandatory:
        return "completed"
    if any(t.status == "rejected" for t in mandatory):
        return "blocked"
    if all(t.status == "approved" for t in mandatory):
        return "completed"
    return "in_progress"


def get_track_completion_fraction(db: Session, employee_id: str, track: str) -> float:
    """0.0-1.0 fractional progress for a track, based on the share of
    mandatory tasks approved. Used by services/progress.py so the
    Directory/Profile completion % reflects real approval progress
    instead of just 'tasks were generated' (the old, less meaningful
    definition this replaces)."""
    tasks = db.query(OnboardingTask).filter(
        OnboardingTask.employee_id == employee_id, OnboardingTask.track == track
    ).all()
    if not tasks:
        return 0.0
    mandatory = [t for t in tasks if t.is_mandatory]
    if not mandatory:
        return 1.0  # all-optional track with tasks present counts as satisfied
    approved = sum(1 for t in mandatory if t.status == "approved")
    return approved / len(mandatory)


def get_all_track_statuses(db: Session, employee_id: str) -> dict:
    return {track: get_track_status(db, employee_id, track) for track in TRACKS}


def recompute_employee_status(db: Session, employee_id: str):
    """Call after any task decision -- flips employee to 'active' once
    every track is completed. No-op if employee isn't mid-onboarding.
    Records activated_at so AI Insights can compute real onboarding
    duration per department later."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee or employee.status != "onboarding":
        return
    statuses = get_all_track_statuses(db, employee_id)
    if all(s == "completed" for s in statuses.values()):
        employee.status = "active"
        employee.activated_at = datetime.datetime.utcnow()
        db.commit()
