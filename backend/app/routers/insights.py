"""
AI Insights Dashboard. Deliberately RULE-BASED computation with template
phrasing, not free-form AI generation -- these are numeric facts shown
on an executive-facing screen, and letting a model invent the wording
around real computed numbers is safe, letting it invent the numbers
themselves risks hallucinated statistics. AI has no role in producing
the figures here, only (optionally, not implemented) in rephrasing text
around numbers that are always independently computed.
"""
import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import Employee, OnboardingTask, AssetAllocation, RiskAssessment

router = APIRouter(prefix="/insights", tags=["insights"])

DELAY_THRESHOLD_HOURS = 24
OVERDUE_ASSET_RETURN_DAYS = 7


@router.get("/summary")
def get_insights(db: Session = Depends(get_db)):
    insights = []
    now = datetime.datetime.utcnow()

    # 1. Onboarding requests delayed due to pending IT approvals
    delay_cutoff = now - datetime.timedelta(hours=DELAY_THRESHOLD_HOURS)
    delayed_it_employee_ids = (
        db.query(OnboardingTask.employee_id)
        .filter(
            OnboardingTask.track == "IT",
            OnboardingTask.status == "pending",
            OnboardingTask.created_at <= delay_cutoff,
        )
        .distinct()
        .all()
    )
    delayed_count = len(delayed_it_employee_ids)
    if delayed_count > 0:
        insights.append({
            "category": "onboarding_delay",
            "text": f"{delayed_count} onboarding request{'s' if delayed_count != 1 else ''} "
                    f"{'are' if delayed_count != 1 else 'is'} delayed due to pending IT approvals.",
            "value": delayed_count,
        })

    # 2. Department with the longest average onboarding duration
    completed = (
        db.query(Employee.department, Employee.created_at, Employee.activated_at)
        .filter(Employee.activated_at.isnot(None))
        .all()
    )
    if completed:
        durations_by_dept: dict[str, list] = {}
        for dept, created_at, activated_at in completed:
            hours = (activated_at - created_at).total_seconds() / 3600
            durations_by_dept.setdefault(dept, []).append(hours)

        dept_averages = {dept: sum(hrs) / len(hrs) for dept, hrs in durations_by_dept.items()}
        if len(dept_averages) >= 2:
            slowest_dept = max(dept_averages, key=dept_averages.get)
            slowest_avg = dept_averages[slowest_dept]
            other_avgs = [v for k, v in dept_averages.items() if k != slowest_dept]
            overall_other_avg = sum(other_avgs) / len(other_avgs)
            if slowest_avg > overall_other_avg:
                insights.append({
                    "category": "department_duration",
                    "text": f"{slowest_dept} onboarding averages {slowest_avg:.1f} hours, "
                            f"longer than other departments.",
                    "value": round(slowest_avg, 1),
                })

    # 3. Employees with incomplete compliance documentation
    incomplete_compliance_employee_ids = (
        db.query(OnboardingTask.employee_id)
        .filter(OnboardingTask.category == "compliance", OnboardingTask.status != "approved")
        .distinct()
        .all()
    )
    incomplete_count = len(incomplete_compliance_employee_ids)
    if incomplete_count > 0:
        insights.append({
            "category": "compliance_incomplete",
            "text": f"{incomplete_count} employee{'s' if incomplete_count != 1 else ''} "
                    f"{'have' if incomplete_count != 1 else 'has'} incomplete compliance documentation.",
            "value": incomplete_count,
        })

    # 4. Offboarding requests with overdue asset returns
    overdue_cutoff = now - datetime.timedelta(days=OVERDUE_ASSET_RETURN_DAYS)
    overdue_assets = (
        db.query(AssetAllocation)
        .filter(AssetAllocation.status == "pending_return", AssetAllocation.pending_return_at <= overdue_cutoff)
        .count()
    )
    if overdue_assets > 0:
        insights.append({
            "category": "overdue_assets",
            "text": f"{overdue_assets} offboarding request{'s' if overdue_assets != 1 else ''} "
                    f"{'have' if overdue_assets != 1 else 'has'} overdue asset returns.",
            "value": overdue_assets,
        })

    # 5. High-risk privileged access pending removal
    high_risk_pending = (
        db.query(RiskAssessment)
        .join(Employee, Employee.id == RiskAssessment.employee_id)
        .filter(RiskAssessment.risk_level == "High", Employee.status == "offboarding")
        .count()
    )
    if high_risk_pending > 0:
        insights.append({
            "category": "high_risk_access",
            "text": f"{high_risk_pending} user{'s' if high_risk_pending != 1 else ''} "
                    f"{'have' if high_risk_pending != 1 else 'has'} high-risk privileged access pending removal.",
            "value": high_risk_pending,
        })

    return {"insights": insights, "generated_at": now}
