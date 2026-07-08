"""
Approval decisions. Two side effects worth knowing about:

1. Manager/IT approval on an onboarding workflow writes a matching
   OnboardingTracker row (using the STEP_MANAGER_APPROVAL / STEP_IT_APPROVAL
   constants from onboarding_orchestrator.py, not re-typed strings) --
   this is what lets profile_completion_pct actually reach 100%.
2. Once every approval for a workflow is approved, the employee's status
   advances (onboarding -> active, offboarding -> exited).
"""
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Approval, OnboardingTracker, Employee
from app.schemas.employee import ApprovalDecision
from app.orchestrators.onboarding_orchestrator import STEP_MANAGER_APPROVAL, STEP_IT_APPROVAL

router = APIRouter(prefix="/approvals", tags=["approvals"])

_TRACKER_STEP_BY_APPROVER = {
    "Manager": STEP_MANAGER_APPROVAL,
    "IT": STEP_IT_APPROVAL,
}


@router.get("/{employee_id}")
def get_approvals(employee_id: str, db: Session = Depends(get_db)):
    rows = db.query(Approval).filter(Approval.employee_id == employee_id).all()
    return [
        {"approver_role": r.approver_role, "workflow_type": r.workflow_type, "status": r.status}
        for r in rows
    ]


@router.post("/{employee_id}/{approver_role}/decide")
def decide_approval(employee_id: str, approver_role: str, payload: ApprovalDecision, db: Session = Depends(get_db)):
    record = (
        db.query(Approval)
        .filter(Approval.employee_id == employee_id, Approval.approver_role == approver_role)
        .order_by(Approval.id.desc())
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Approval record not found")
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'rejected'")

    record.status = payload.status
    record.decided_at = datetime.datetime.utcnow()
    db.commit()

    tracker_step = _TRACKER_STEP_BY_APPROVER.get(approver_role)
    if record.workflow_type == "onboarding" and tracker_step and payload.status == "approved":
        db.add(OnboardingTracker(employee_id=employee_id, step=tracker_step, status="completed"))
        db.commit()

    all_approvals = db.query(Approval).filter(
        Approval.employee_id == employee_id, Approval.workflow_type == record.workflow_type
    ).all()
    if all_approvals and all(a.status == "approved" for a in all_approvals):
        employee = db.query(Employee).filter(Employee.id == employee_id).first()
        employee.status = "active" if record.workflow_type == "onboarding" else "exited"
        db.commit()

    return {"employee_id": employee_id, "approver_role": approver_role, "status": record.status}
