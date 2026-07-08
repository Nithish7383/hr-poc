"""
Aggregates everything needed for the Employee Profile screen into one call --
personal info, employment details, real completion %, timeline, recent activity.

Completion % now comes from app.services.progress (shared with the
Employee Directory listing) instead of a locally hardcoded step count --
this is the fix for Directory and Profile showing different numbers
for the same employee.
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import (
    Employee, OnboardingTracker, OffboardingTracker, AccessRecommendation,
    AssetAllocation, ComplianceTask, Approval, AuditLog,
)
from app.services.progress import get_onboarding_completion_pct

router = APIRouter(prefix="/employees", tags=["profile"])


@router.get("/{employee_id}/profile")
def get_profile(employee_id: str, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    onboarding_steps = (
        db.query(OnboardingTracker)
        .filter(OnboardingTracker.employee_id == employee_id)
        .order_by(OnboardingTracker.timestamp.asc())
        .all()
    )
    offboarding_steps = (
        db.query(OffboardingTracker)
        .filter(OffboardingTracker.employee_id == employee_id)
        .order_by(OffboardingTracker.timestamp.asc())
        .all()
    )

    completion_pct = get_onboarding_completion_pct(db, employee_id)

    timeline = [
        {"step": s.step, "status": s.status, "timestamp": s.timestamp, "flow": "onboarding"}
        for s in onboarding_steps
    ] + [
        {"step": s.step, "status": s.status, "timestamp": s.timestamp, "flow": "offboarding"}
        for s in offboarding_steps
    ]
    timeline.sort(key=lambda x: x["timestamp"])

    recent_activity = (
        db.query(AuditLog)
        .filter(AuditLog.employee_id == employee_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(10)
        .all()
    )

    access = db.query(AccessRecommendation).filter(AccessRecommendation.employee_id == employee_id).order_by(AccessRecommendation.created_at.desc()).first()
    assets = db.query(AssetAllocation).filter(AssetAllocation.employee_id == employee_id).order_by(AssetAllocation.created_at.desc()).first()
    compliance_tasks = db.query(ComplianceTask).filter(ComplianceTask.employee_id == employee_id).all()
    approvals = db.query(Approval).filter(Approval.employee_id == employee_id).all()

    return {
        "personal_information": {
            "name": employee.name, "employee_id": employee.employee_id,
            "email": employee.email, "office": employee.office,
        },
        "employment_details": {
            "department": employee.department, "title": employee.title, "role": employee.role,
            "manager": employee.manager, "joining_date": employee.joining_date,
            "status": employee.status, "sync_source": employee.sync_source,
        },
        "profile_completion_pct": completion_pct,
        "timeline": timeline,
        "recent_activity": [
            {"timestamp": a.timestamp, "agent": a.agent, "action": a.action, "detail": a.detail}
            for a in recent_activity
        ],
        "applications": json.loads(access.applications) if access else [],
        "security_groups": json.loads(access.security_groups) if access else [],
        "assets": json.loads(assets.asset_list) if assets else [],
        "compliance_tasks": [{"task_name": t.task_name, "status": t.status} for t in compliance_tasks],
        "approvals": [{"approver_role": a.approver_role, "status": a.status} for a in approvals],
    }
