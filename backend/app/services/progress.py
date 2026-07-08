"""
Shared completion-percentage calculation -- used by both the Employee
Profile endpoint and the Employee Directory listing, so they can never
show two different numbers for the same employee again.

Step count is imported from onboarding_orchestrator.STEPS, not
re-declared here -- this was the root cause of the original bug
(a hardcoded count of 8 that didn't match what the orchestrator
actually marked as complete).
"""
from sqlalchemy.orm import Session
from app.models import OnboardingTracker
from app.orchestrators.onboarding_orchestrator import STEPS

ONBOARDING_STEP_COUNT = len(STEPS)


def get_onboarding_completion_pct(db: Session, employee_id: str) -> int:
    steps = db.query(OnboardingTracker).filter(
        OnboardingTracker.employee_id == employee_id, OnboardingTracker.status == "completed"
    ).all()
    completed = len({s.step for s in steps})
    return round((completed / ONBOARDING_STEP_COUNT) * 100) if steps else 0
