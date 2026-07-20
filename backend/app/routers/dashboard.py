"""
Executive Dashboard summary endpoint.

pending_approvals counts pending tasks across BOTH OnboardingTask and
OffboardingTask -- the old Approval table is fully retired for both
workflows now (see routers/approvals.py), so nothing should reference
it here anymore.

compliance_completion_pct likewise combines category="compliance" rows
from both task tables, matching what the Compliance Dashboard shows.
"""
from app.models import EmployeeDocument
from app import database
import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, exists, distinct
from app.database import get_db
from app.models import (
    Employee, RiskAssessment,
    OnboardingTracker, OffboardingTracker, AuditLog, OnboardingTask, OffboardingTask,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
TREND_DAYS = 7


def _daily_trend(db: Session, tracker_model, step_name: str, days: int = TREND_DAYS):
    since = datetime.datetime.utcnow().date() - datetime.timedelta(days=days - 1)
    rows = (
        db.query(func.date(tracker_model.timestamp).label("day"), func.count(tracker_model.id))
        .filter(tracker_model.step == step_name, tracker_model.status == "completed")
        .filter(func.date(tracker_model.timestamp) >= since)
        .group_by("day")
        .order_by("day")
        .all()
    )
    counts_by_day = {str(day): count for day, count in rows}
    result = []
    for i in range(days):
        day = since + datetime.timedelta(days=i)
        result.append({"date": str(day), "count": counts_by_day.get(str(day), 0)})
    return result


@router.get("/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    today = datetime.datetime.utcnow().date()

    total_employees = (
        db.query(Employee)
        .filter(Employee.status.in_(["onboarding", "offboarding"]))
        .count()
    )
    total_onboarded = (
        db.query(Employee)
        .filter(Employee.status == "active")
        .count()
    )
    total_offboarded = (
        db.query(Employee)
        .filter(Employee.status == "exited")
        .count()
    )
    pending_onboarding = db.query(Employee).filter(Employee.status == "onboarding").count()
    pending_offboarding = db.query(Employee).filter(Employee.status == "offboarding").count()

    # pending_onboarding_tasks = db.query(OnboardingTask).filter(OnboardingTask.status == "pending").count()
    # pending_offboarding_tasks = db.query(OffboardingTask).filter(OffboardingTask.status == "pending").count()
    # pending_approvals = pending_onboarding_tasks + pending_offboarding_tasks

    # pending_hr_approvals = (
    # db.query(distinct(OnboardingTask.employee_id))
    # .filter(
    #     OnboardingTask.status == "pending",
    #     OnboardingTask.track == "HR"
    # )
    # .count()
    # )

    # pending_it_approvals = (
    # db.query(distinct(OnboardingTask.employee_id))
    # .filter(
    #     OnboardingTask.status == "pending",
    #     OnboardingTask.track == "IT"
    # )
    # .count()
    # )

    # pending_onboarding_tasks_hr_it = pending_hr_approvals + pending_it_approvals

    pending_hr = (
        db.query(distinct(OnboardingTask.employee_id))
        .join(Employee, Employee.id == OnboardingTask.employee_id)
        .filter(
            Employee.status == "onboarding",
            OnboardingTask.track == "HR",
            OnboardingTask.status == "pending",
        )
        .count()
    )

    pending_hr += (
        db.query(distinct(OffboardingTask.employee_id))
        .join(Employee, Employee.id == OffboardingTask.employee_id)
        .filter(
            Employee.status == "offboarding",
            OffboardingTask.track == "HR",
            OffboardingTask.status == "pending",
        )
        .count()
    )

    pending_it = (
        db.query(distinct(OnboardingTask.employee_id))
        .join(Employee, Employee.id == OnboardingTask.employee_id)
        .filter(
            Employee.status == "onboarding",
            OnboardingTask.track == "IT",
            OnboardingTask.status == "pending",
        )
        .count()    
    )

    pending_it += (
        db.query(distinct(OffboardingTask.employee_id))
        .join(Employee, Employee.id == OffboardingTask.employee_id)
        .filter(
            Employee.status == "offboarding",
            OffboardingTask.track == "IT",
            OffboardingTask.status == "pending",
        )
        .count()
    )

    pending_approvals = pending_hr + pending_it

    high_risk_employees = db.query(RiskAssessment).filter(RiskAssessment.risk_level == "High").count()

    onboarding_compliance_total = db.query(OnboardingTask).filter(OnboardingTask.category == "compliance").count()
    onboarding_compliance_done = db.query(OnboardingTask).filter(
        OnboardingTask.category == "compliance", OnboardingTask.status == "approved"
    ).count()
    offboarding_compliance_total = db.query(OffboardingTask).filter(OffboardingTask.category == "compliance").count()
    offboarding_compliance_done = db.query(OffboardingTask).filter(
        OffboardingTask.category == "compliance", OffboardingTask.status == "approved"
    ).count()
    total_compliance = onboarding_compliance_total + offboarding_compliance_total
    done_compliance = onboarding_compliance_done + offboarding_compliance_done
    compliance_completion_pct = round((done_compliance / total_compliance * 100), 1) if total_compliance else 0.0

    onboarded_today = (
        db.query(OnboardingTracker)
        .filter(OnboardingTracker.step == "Registered", OnboardingTracker.status == "completed")
        .filter(func.date(OnboardingTracker.timestamp) == today)
        .count()
    )
    offboarded_today = (
        db.query(OffboardingTracker)
        .filter(OffboardingTracker.step == "Exit Request", OffboardingTracker.status == "completed")
        .filter(func.date(OffboardingTracker.timestamp) == today)
        .count()
    )

    department_rows = db.query(Employee.department, func.count(Employee.id)).group_by(Employee.department).all()
    role_rows = (
        db.query(Employee.role, func.count(Employee.id))
        .filter(Employee.role.isnot(None))
        .group_by(Employee.role)
        .all()
    )
    pending_documents = (
        db.query(distinct(EmployeeDocument.employee_id))
        .join(Employee, Employee.id == EmployeeDocument.employee_id)
        .filter(
            Employee.status == "onboarding",
            EmployeeDocument.status.in_(["pending", "under_review"])
        )
        .count()
    )

    recent_activity = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(10).all()

    return {
        "total_employees": total_employees,
        "total_onboarded": total_onboarded,
        "total_offboarded": total_offboarded,
        "pending_onboarding": pending_onboarding,
        "pending_offboarding": pending_offboarding,
        "pending_approvals": pending_approvals,
        "onboarded_today": onboarded_today,
        "offboarded_today": offboarded_today,
        "pending_documents": pending_documents,
        # "pending_onboarding_hr_it": pending_onboarding_tasks_hr_it,
        "high_risk_employees": high_risk_employees,
        "compliance_completion_pct": compliance_completion_pct,
        "department_distribution": [{"name": d or "Unassigned", "count": c} for d, c in department_rows],
        "role_distribution": [{"name": r, "count": c} for r, c in role_rows],
        "onboarding_trend": _daily_trend(db, OnboardingTracker, "Registered"),
        "offboarding_trend": _daily_trend(db, OffboardingTracker, "Exit Request"),
        "recent_activity": [
            {"timestamp": r.timestamp, "agent": r.agent, "action": r.action,
             "detail": r.detail, "employee_id": r.employee_id}
            for r in recent_activity
        ],
    }
