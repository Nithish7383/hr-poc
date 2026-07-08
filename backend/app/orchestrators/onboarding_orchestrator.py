"""
Owns the onboarding step sequence. Writes a tracker row after every step
so the frontend can poll GET /onboarding/{id}/status and drive the
Onboarding Tracker UI without knowing anything about agents internally.

Step names are defined ONCE as constants below -- STEPS is derived from
them, and every other module that needs the step count or step names
(services/progress.py, routers/approvals.py) imports from here instead
of hardcoding its own copy. This is the fix for the completion-percentage
bug where the step count drifted out of sync with the actual step list.
"""
import json
from sqlalchemy.orm import Session
from app.models import (
    Employee, OnboardingTracker, RoleClassification, AccessRecommendation,
    AssetAllocation, ComplianceTask, Approval, AuditLog,
)
from app.agents.role_classifier import classify_role
from app.agents.access_recommender import recommend_access
from app.agents.hardware_recommender import recommend_hardware
from app.agents.compliance_recommender import recommend_compliance
from app.constants import APPROVER_ROLES

STEP_REGISTERED = "Registered"
STEP_VALIDATION = "Validation"
STEP_ROLE_CLASSIFICATION = "Role Classification"
STEP_ACCESS_RECOMMENDATION = "Access Recommendation"
STEP_ASSET_ALLOCATION = "Asset Allocation"
STEP_COMPLIANCE = "Compliance"
STEP_MANAGER_APPROVAL = "Manager Approval"
STEP_IT_APPROVAL = "IT Approval"

STEPS = [
    STEP_REGISTERED, STEP_VALIDATION, STEP_ROLE_CLASSIFICATION, STEP_ACCESS_RECOMMENDATION,
    STEP_ASSET_ALLOCATION, STEP_COMPLIANCE, STEP_MANAGER_APPROVAL, STEP_IT_APPROVAL,
]


def _mark(db: Session, employee_id: str, step: str, status: str):
    db.add(OnboardingTracker(employee_id=employee_id, step=step, status=status))
    db.commit()


def _audit(db: Session, employee_id: str, agent: str, action: str, detail: str = ""):
    db.add(AuditLog(employee_id=employee_id, agent=agent, action=action, detail=detail))
    db.commit()


def _validate(employee: Employee) -> tuple[bool, str]:
    """Rule-based validation -- no Ollama needed for mandatory-field checks."""
    if not employee.name or not employee.employee_id or not employee.email:
        return False, "Missing mandatory field(s)."
    if not employee.department:
        return False, "Missing department."
    return True, "All mandatory fields present."


def run_onboarding(db: Session, employee_id: str):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise ValueError(f"Employee {employee_id} not found")

    _mark(db, employee_id, STEP_REGISTERED, "completed")

    # 1. Validation (rule-based)
    _mark(db, employee_id, STEP_VALIDATION, "running")
    is_valid, reason = _validate(employee)
    _mark(db, employee_id, STEP_VALIDATION, "completed" if is_valid else "failed")
    _audit(db, employee_id, "Validation Agent", "Employee validated" if is_valid else "Validation failed", reason)
    if not is_valid:
        return {"status": "failed", "reason": reason}

    # 2. Role Classification (Ollama, with fallback)
    _mark(db, employee_id, STEP_ROLE_CLASSIFICATION, "running")
    classification = classify_role(employee.department, employee.title, employee.office)
    employee.role = classification["role"]
    db.add(RoleClassification(
        employee_id=employee_id,
        predicted_role=classification["role"],
        confidence=classification.get("confidence", 0.0),
        reasoning=classification.get("reasoning", ""),
    ))
    db.commit()
    _mark(db, employee_id, STEP_ROLE_CLASSIFICATION, "completed")
    _audit(db, employee_id, "Role Agent", f"{classification['role']} detected", classification.get("reasoning", ""))

    # 3. Access Recommendation (config-driven + Ollama reasoning)
    _mark(db, employee_id, STEP_ACCESS_RECOMMENDATION, "running")
    access = recommend_access(employee.role)
    db.add(AccessRecommendation(
        employee_id=employee_id,
        applications=json.dumps(access["applications"]),
        security_groups=json.dumps(access["security_groups"]),
        ethical_wall_rules=json.dumps(access["ethical_wall_rules"]),
        reasoning=access["reasoning"],
    ))
    db.commit()
    _mark(db, employee_id, STEP_ACCESS_RECOMMENDATION, "completed")
    _audit(db, employee_id, "Access Agent", "Applications assigned", access["reasoning"])

    # 4. Asset Allocation (config-driven)
    _mark(db, employee_id, STEP_ASSET_ALLOCATION, "running")
    hardware = recommend_hardware(employee.role)
    db.add(AssetAllocation(employee_id=employee_id, asset_list=json.dumps(hardware["asset_list"])))
    db.commit()
    _mark(db, employee_id, STEP_ASSET_ALLOCATION, "completed")

    # 5. Compliance (config-driven)
    _mark(db, employee_id, STEP_COMPLIANCE, "running")
    tasks = recommend_compliance(employee.role)
    for task_name in tasks:
        db.add(ComplianceTask(employee_id=employee_id, task_name=task_name))
    db.commit()
    _mark(db, employee_id, STEP_COMPLIANCE, "completed")

    # 6. Create approval records (pending -- resolved via /approvals endpoint,
    # which is also what writes the Manager/IT Approval tracker steps once decided)
    for approver_role in APPROVER_ROLES:
        db.add(Approval(employee_id=employee_id, workflow_type="onboarding", approver_role=approver_role))
    db.commit()

    employee.status = "onboarding"
    db.commit()

    return {"status": "in_progress", "role": employee.role}
