from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import datetime
from app.database import get_db
from app.models import OnboardingTracker, Employee, EmployeeDocument, OnboardingTask
from app.schemas.employee import TaskDecision, TaskSelectionUpdate
from app.orchestrators.onboarding_orchestrator import run_onboarding, resume_after_documents
from app.services.track_status import get_all_track_statuses, recompute_employee_status

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("/{employee_id}/start")
def start_onboarding(employee_id: str, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return run_onboarding(db, employee_id)


@router.get("/{employee_id}/status")
def onboarding_status(employee_id: str, db: Session = Depends(get_db)):
    """Frontend polls this to drive the Onboarding Tracker timeline UI.
    Read-only -- the Tracker never writes through this or any other
    onboarding endpoint anymore; only the Approval Dashboard's decide
    endpoint changes task state."""
    rows = (
        db.query(OnboardingTracker)
        .filter(OnboardingTracker.employee_id == employee_id)
        .order_by(OnboardingTracker.timestamp.asc())
        .all()
    )
    return [{"step": r.step, "status": r.status, "timestamp": r.timestamp} for r in rows]


@router.get("/{employee_id}/documents")
def get_document_status(employee_id: str, db: Session = Depends(get_db)):
    """Shows required-document status. Email drafting was removed --
    HR reviews document status directly and marks received, no
    simulated email in between."""
    docs = db.query(EmployeeDocument).filter(EmployeeDocument.employee_id == employee_id).all()
    return {
        "documents": [
            {"document_name": d.document_name, "status": d.status,
             "requested_at": d.requested_at, "received_at": d.received_at}
            for d in docs
        ],
    }


@router.post("/{employee_id}/documents/mark-received")
def mark_documents_received(employee_id: str, db: Session = Depends(get_db)):
    """HR confirms documents were received -- resumes a paused pipeline."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    try:
        return resume_after_documents(db, employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{employee_id}/tasks")
def get_tasks(employee_id: str, db: Session = Depends(get_db)):
    """Tasks grouped by track, PLUS each track's live-computed status --
    the single source of truth both the read-only Tracker and the
    Approval Dashboard read from. Track status is never stored, always
    computed fresh from task state (see services/track_status.py).

    options/selected_options are parsed from JSON here so the frontend
    gets real arrays, not JSON strings -- multi_select/single_select
    tasks only, null for 'simple' tasks."""
    import json as _json
    tasks = db.query(OnboardingTask).filter(OnboardingTask.employee_id == employee_id).all()
    by_track: dict[str, list] = {"HR": [], "IT": [], "Security": [], "Manager": []}
    for t in tasks:
        by_track.setdefault(t.track, []).append({
            "id": t.id, "task_name": t.task_name, "status": t.status,
            "is_mandatory": t.is_mandatory,
            "is_ai_generated": t.is_ai_generated == "true",
            "ai_recommendation": t.ai_recommendation,
            "task_type": t.task_type,
            "options": _json.loads(t.options) if t.options else None,
            "selected_options": _json.loads(t.selected_options) if t.selected_options else None,
            "category": t.category,
            "created_at": t.created_at, "decided_at": t.decided_at,
        })

    track_statuses = get_all_track_statuses(db, employee_id)
    return {
        "tasks": by_track,
        "track_status": track_statuses,
    }


@router.patch("/{employee_id}/tasks/{task_id}/selection")
def update_task_selection(employee_id: str, task_id: str, payload: TaskSelectionUpdate, db: Session = Depends(get_db)):
    """Lets the approver edit a multi_select/single_select task's choice
    before deciding -- the 'AI suggests, human can change it' pattern.
    Locked once the task has been decided, so history can't be silently
    rewritten after approval/rejection."""
    task = db.query(OnboardingTask).filter(
        OnboardingTask.id == task_id, OnboardingTask.employee_id == employee_id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.task_type not in ("multi_select", "single_select"):
        raise HTTPException(status_code=400, detail="This task does not support selection editing")
    if task.status != "pending":
        raise HTTPException(status_code=400, detail="Cannot change selection after a task has been decided")

    import json as _json
    if task.task_type == "single_select" and len(payload.selected_options) != 1:
        raise HTTPException(status_code=400, detail="single_select tasks require exactly one selected option")

    task.selected_options = _json.dumps(payload.selected_options)
    db.commit()
    return {"id": task.id, "selected_options": payload.selected_options}


@router.post("/{employee_id}/tasks/{task_id}/decide")
def decide_task(employee_id: str, task_id: str, payload: TaskDecision, db: Session = Depends(get_db)):
    """The ONLY place onboarding task status changes -- called from the
    Approval Dashboard exclusively. The Tracker has no write path
    anymore (see architecture change #5/#7)."""
    task = db.query(OnboardingTask).filter(
        OnboardingTask.id == task_id, OnboardingTask.employee_id == employee_id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'rejected'")

    task.status = payload.status
    task.decided_at = datetime.datetime.utcnow()
    db.commit()

    recompute_employee_status(db, employee_id)

    return {"id": task.id, "task_name": task.task_name, "status": task.status}
