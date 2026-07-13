"""
Two different mechanisms live here, deliberately:

ONBOARDING approvals are now TASK-LEVEL -- there's no per-track Approval
record anymore (retired per the architecture change). This endpoint reads
OnboardingTask rows directly, grouped by employee, for whichever track
matches the logged-in role.

OFFBOARDING approvals are UNCHANGED -- still the original per-track
Approval table, since this redesign was onboarding-specific.
"""
import datetime
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Approval, Employee, OnboardingTask
from app.schemas.employee import ApprovalDecision
from app.services.track_status import TRACKS

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.get("/pending/{approver_role}")
def get_approvals_for_role(approver_role: str, db: Session = Depends(get_db)):
    results = []

    if approver_role in TRACKS:
        tasks = (
            db.query(OnboardingTask)
            .filter(OnboardingTask.track == approver_role)
            .order_by(OnboardingTask.created_at.desc())
            .all()
        )
        tasks_by_employee: dict[str, list] = {}
        for t in tasks:
            tasks_by_employee.setdefault(t.employee_id, []).append(t)

        for employee_id, task_list in tasks_by_employee.items():
            employee = db.query(Employee).filter(Employee.id == employee_id).first()
            if not employee:
                continue
            results.append({
                "employee_id": employee.id, "employee_name": employee.name,
                "department": employee.department, "role": employee.role,
                "experience_level": employee.experience_level,
                "workflow_type": "onboarding",
                "tasks": [
                    {"id": t.id, "task_name": t.task_name, "status": t.status,
                     "is_mandatory": t.is_mandatory,
                     "is_ai_generated": t.is_ai_generated == "true",
                     "ai_recommendation": t.ai_recommendation,
                     "task_type": t.task_type,
                     "options": json.loads(t.options) if t.options else None,
                     "selected_options": json.loads(t.selected_options) if t.selected_options else None,
                     "category": t.category}
                    for t in task_list
                ],
            })

    offboarding_approvals = (
        db.query(Approval)
        .filter(Approval.approver_role == approver_role, Approval.workflow_type == "offboarding")
        .order_by(Approval.id.desc())
        .all()
    )
    for a in offboarding_approvals:
        employee = db.query(Employee).filter(Employee.id == a.employee_id).first()
        if not employee:
            continue
        results.append({
            "employee_id": employee.id, "employee_name": employee.name,
            "department": employee.department, "role": employee.role,
            "experience_level": employee.experience_level,
            "workflow_type": "offboarding", "approval_status": a.status, "tasks": [],
        })

    return results


@router.get("/{employee_id}")
def get_approvals(employee_id: str, db: Session = Depends(get_db)):
    """Offboarding-only now -- onboarding has no Approval rows."""
    rows = db.query(Approval).filter(Approval.employee_id == employee_id).all()
    return [
        {"approver_role": r.approver_role, "workflow_type": r.workflow_type, "status": r.status}
        for r in rows
    ]


@router.post("/{employee_id}/{approver_role}/decide")
def decide_approval(employee_id: str, approver_role: str, payload: ApprovalDecision, db: Session = Depends(get_db)):
    """Offboarding-only now. Onboarding decisions go through
    POST /onboarding/{employee_id}/tasks/{task_id}/decide instead."""
    record = (
        db.query(Approval)
        .filter(Approval.employee_id == employee_id, Approval.approver_role == approver_role)
        .order_by(Approval.id.desc())
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Approval record not found (note: onboarding approvals moved to per-task decisions)")
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'rejected'")

    record.status = payload.status
    record.decided_at = datetime.datetime.utcnow()
    db.commit()

    all_approvals = db.query(Approval).filter(
        Approval.employee_id == employee_id, Approval.workflow_type == record.workflow_type
    ).all()
    if all_approvals and all(a.status == "approved" for a in all_approvals):
        employee = db.query(Employee).filter(Employee.id == employee_id).first()
        employee.status = "exited" if record.workflow_type == "offboarding" else "active"
        db.commit()

    return {"employee_id": employee_id, "approver_role": approver_role, "status": record.status}
