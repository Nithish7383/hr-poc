"""
Owns the offboarding step sequence. Mirrors onboarding_orchestrator.py --
same tracker-row-per-step pattern, same audit logging pattern.

Step order: Exit Request -> Access Discovery -> Risk Assessment ->
Deprovisioning Plan -> Asset Recovery -> Exit Compliance.

APPROVER_ROLES and DEPROVISION_ACTIONS come from app.constants (shared with
onboarding_orchestrator.py, no longer duplicated). Risk factor role-mapping
comes from config_data/risk_factors.json (no longer hardcoded role sets
inline) -- same pattern as every other config-driven agent.
"""
import json
from sqlalchemy.orm import Session
from app.models import (
    Employee, OffboardingTracker, ExitRequest, AccessRecommendation,
    AssetAllocation, RiskAssessment, ComplianceTask, Approval, AuditLog,
)
from app.agents.risk_assessor import assess_risk
from app.constants import APPROVER_ROLES, DEPROVISION_ACTIONS
from app.config import get_risk_factors


def _mark(db: Session, employee_id: str, step: str, status: str):
    db.add(OffboardingTracker(employee_id=employee_id, step=step, status=status))
    db.commit()


def _audit(db: Session, employee_id: str, agent: str, action: str, detail: str = ""):
    db.add(AuditLog(employee_id=employee_id, agent=agent, action=action, detail=detail))
    db.commit()


def run_offboarding(db: Session, employee_id: str, last_working_day: str = None, exit_reason: str = None, sync_source: str = "manual"):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise ValueError(f"Employee {employee_id} not found")

    # 1. Exit Request
    db.add(ExitRequest(employee_id=employee_id, last_working_day=last_working_day,
                        exit_reason=exit_reason, sync_source=sync_source))
    db.commit()
    _mark(db, employee_id, "Exit Request", "completed")

    # 2. Access Discovery -- pull from this employee's own onboarding records
    _mark(db, employee_id, "Access Discovery", "running")
    access_record = (
        db.query(AccessRecommendation)
        .filter(AccessRecommendation.employee_id == employee_id)
        .order_by(AccessRecommendation.created_at.desc())
        .first()
    )
    asset_record = (
        db.query(AssetAllocation)
        .filter(AssetAllocation.employee_id == employee_id)
        .order_by(AssetAllocation.created_at.desc())
        .first()
    )
    has_admin_rights = access_record is not None and "Admin Groups" in (access_record.security_groups or "")

    risk_factors_config = get_risk_factors()
    role_factors = risk_factors_config.get(employee.role, {})
    has_legal_access = role_factors.get("legal_access", False)
    has_financial_access = role_factors.get("financial_access", False)
    has_client_data_access = role_factors.get("client_data_access", False)

    _mark(db, employee_id, "Access Discovery", "completed")
    _audit(db, employee_id, "Access Discovery", "Access inventory captured")

    # 3. Risk Assessment (Ollama, with fallback)
    _mark(db, employee_id, "Risk Assessment", "running")
    risk = assess_risk(has_admin_rights, has_client_data_access, has_financial_access, has_legal_access)
    db.add(RiskAssessment(employee_id=employee_id, risk_level=risk["risk_level"],
                           factors=json.dumps(risk["factors"]), reasoning=risk["reasoning"]))
    db.commit()
    _mark(db, employee_id, "Risk Assessment", "completed")
    _audit(db, employee_id, "Risk Agent", f"{risk['risk_level']} risk classified", risk["reasoning"])

    # 4. Deprovisioning Plan (rule-based list of simulated actions)
    _mark(db, employee_id, "Deprovisioning Plan", "completed")
    _audit(db, employee_id, "Deprovisioning Agent", "Deprovisioning checklist generated",
           ", ".join(DEPROVISION_ACTIONS))

    # 5. Asset Recovery -- flip previously allocated assets to "pending return"
    _mark(db, employee_id, "Asset Recovery", "running")
    if asset_record:
        asset_record.status = "pending_return"
        db.commit()
    _mark(db, employee_id, "Asset Recovery", "completed")

    # 6. Exit Compliance (NDA reminder, exit interview, etc.)
    _mark(db, employee_id, "Exit Compliance", "running")
    for task_name in ["Asset Return Confirmation", "NDA Reminder", "Client Confidentiality Reminder", "Exit Interview"]:
        db.add(ComplianceTask(employee_id=employee_id, task_name=task_name))
    db.commit()
    _mark(db, employee_id, "Exit Compliance", "completed")

    # 7. Approvals
    for approver_role in APPROVER_ROLES:
        db.add(Approval(employee_id=employee_id, workflow_type="offboarding", approver_role=approver_role))
    db.commit()

    employee.status = "offboarding"
    db.commit()

    return {"status": "in_progress", "risk_level": risk["risk_level"]}
