"""
Both ONBOARDING and OFFBOARDING approvals are now TASK-LEVEL -- the old
per-track Approval table is fully retired for both workflows (it's kept
as a model for now, unused, rather than dropped -- see main progress
doc for the housekeeping note on cleaning it up later). This endpoint
reads OnboardingTask and OffboardingTask directly, grouped by employee,
for whichever track matches the logged-in role.
"""
import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Employee, OnboardingTask, OffboardingTask
from app.services.track_status import TRACKS

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _serialize_tasks(task_list):
    return [
        {"id": t.id, "task_name": t.task_name, "status": t.status,
         "is_mandatory": t.is_mandatory,
         "is_ai_generated": t.is_ai_generated == "true",
         "ai_recommendation": t.ai_recommendation,
         "task_type": t.task_type,
         "options": json.loads(t.options) if t.options else None,
         "selected_options": json.loads(t.selected_options) if t.selected_options else None,
         "category": t.category,
         "document_id": getattr(t, "document_id", None)}
        for t in task_list
    ]


def _tasks_by_employee(db: Session, task_model, approver_role: str):
    tasks = (
        db.query(task_model)
        .filter(task_model.track == approver_role)
        .order_by(task_model.created_at.desc())
        .all()
    )
    grouped: dict[str, list] = {}
    for t in tasks:
        grouped.setdefault(t.employee_id, []).append(t)
    return grouped


@router.get("/pending/{approver_role}")
def get_approvals_for_role(approver_role: str, db: Session = Depends(get_db)):
    if approver_role not in TRACKS:
        return []

    results = []

    for workflow_type, task_model in (("onboarding", OnboardingTask), ("offboarding", OffboardingTask)):
        grouped = _tasks_by_employee(db, task_model, approver_role)
        for employee_id, task_list in grouped.items():
            employee = db.query(Employee).filter(Employee.id == employee_id).first()
            if not employee:
                continue
            results.append({
                "employee_id": employee.id, "employee_name": employee.name,
                "department": employee.department, "role": employee.role,
                "experience_level": employee.experience_level,
                "workflow_type": workflow_type,
                "tasks": _serialize_tasks(task_list),
            })

    return results
