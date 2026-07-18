"""
Owns the onboarding step sequence.

Registered -> Validation (can pause on missing documents, no email --
email drafting was removed; HR just sees document status directly and
marks received) -> Role Classification (FALLBACK ONLY -- skipped
entirely if HRMS already provided a valid role) -> fans out into FOUR
PARALLEL TRACKS (HR, IT, Security, Manager), each populated with
OnboardingTask rows.

Approval now happens PER TASK, in the Approval Dashboard only -- this
orchestrator never marks a task "approved," it only creates tasks in
"pending" status. Track and employee completion are computed live from
task state (see services/track_status.py), never stored here.
"""
import json
import datetime
from sqlalchemy.orm import Session
from app.models import (
    Employee, OnboardingTracker, RoleClassification, AccessRecommendation,
    AssetAllocation, AuditLog,
    EmployeeDocument, OnboardingTask, DocumentRequestEmail
)
from app.agents.role_classifier import classify_role
from app.agents.access_recommender import recommend_access
from app.agents.hardware_recommender import recommend_hardware
from app.agents.compliance_recommender import recommend_compliance
from app.agents.project_recommender_agent import recommend_projects
from app.agents.privileged_access_agent import review_privileged_access
from app.agents.team_intro_agent import draft_team_intro
from app.agents.document_email_agent import draft_document_request_email
from app.agents.welcome_email_agent import draft_welcome_email
from app.agents.feedback_survey_agent import draft_feedback_request_email
from app import email_client
from app.models import WelcomeEmail, FeedbackEmail
from app.config import (
    get_required_documents, get_roles,
    get_all_applications, get_all_security_groups, get_all_assets, get_all_project_names,
)

STEP_REGISTERED = "Registered"
STEP_VALIDATION = "Validation"
STEP_HR_TRACK = "HR Track"
STEP_IT_TRACK = "IT Track"
STEP_SECURITY_TRACK = "Security Track"
STEP_MANAGER_TRACK = "Manager Track"

STEPS = [
    STEP_REGISTERED, STEP_VALIDATION,
    STEP_HR_TRACK, STEP_IT_TRACK, STEP_SECURITY_TRACK, STEP_MANAGER_TRACK,
]

STATUS_BLOCKED = "blocked"  # tracker status meaning "paused pending employee action"


def _mark(db: Session, employee_id: str, step: str, status: str):
    db.add(OnboardingTracker(employee_id=employee_id, step=step, status=status))
    db.commit()


def _audit(db: Session, employee_id: str, agent: str, action: str, detail: str = ""):
    db.add(AuditLog(employee_id=employee_id, agent=agent, action=action, detail=detail))
    db.commit()


def _add_task(db: Session, employee_id: str, track: str, task_name: str,
               is_mandatory: bool = True, is_ai_generated: bool = False, ai_recommendation: str = None,
               task_type: str = "simple", options: list = None, selected_options: list = None,
               category: str = None):
    """Every task starts 'pending' -- the Approval Dashboard is the only
    place status ever changes, per the architecture change. Nothing here
    auto-approves anything, even the AI-generated ones.

    For multi_select/single_select tasks, `options` is the FULL catalog
    and `selected_options` is the AI's suggestion, pre-filled but editable
    by the approver before they decide -- 'AI suggests, human decides and
    can change it', applied consistently across apps/assets/groups/projects."""
    db.add(OnboardingTask(
        employee_id=employee_id, track=track, task_name=task_name, status="pending",
        is_mandatory=is_mandatory,
        is_ai_generated="true" if is_ai_generated else "false",
        ai_recommendation=ai_recommendation,
        task_type=task_type,
        options=json.dumps(options) if options is not None else None,
        selected_options=json.dumps(selected_options) if selected_options is not None else None,
        category=category,
    ))
    db.commit()


def _check_missing_documents(employee: Employee) -> list[str]:
    required = get_required_documents()
    submitted = json.loads(employee.documents_submitted) if employee.documents_submitted else []
    return [d for d in required if d not in submitted]


def run_onboarding(db: Session, employee_id: str):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise ValueError(f"Employee {employee_id} not found")

    if employee.status != "registered":
        return {
            "status": employee.status,
            "note": "Onboarding already in progress or further along -- no action taken to avoid duplicating tasks/emails.",
        }
    
    _mark(db, employee_id, STEP_REGISTERED, "completed")
    _mark(db, employee_id, STEP_VALIDATION, "running")

    if not employee.name or not employee.employee_id or not employee.email or not employee.department:
        _mark(db, employee_id, STEP_VALIDATION, "failed")
        _audit(db, employee_id, "Validation Agent", "Validation failed", "Missing mandatory field(s).")
        return {"status": "failed", "reason": "Missing mandatory field(s)."}

    _draft_and_queue_welcome_email(db, employee)

    missing_docs = _check_missing_documents(employee)
    if missing_docs:
        for doc_name in missing_docs:
            existing = db.query(EmployeeDocument).filter(
                EmployeeDocument.employee_id == employee_id, EmployeeDocument.document_name == doc_name
            ).first()
            if not existing:
                db.add(EmployeeDocument(employee_id=employee_id, document_name=doc_name, status="pending"))
        db.commit()

        _draft_and_queue_missing_document_email(db, employee, missing_docs)


        _mark(db, employee_id, STEP_VALIDATION, STATUS_BLOCKED)
        _audit(db, employee_id, "Validation Agent", "Blocked -- missing documents",
               f"Missing: {', '.join(missing_docs)}. Email drafted, awaiting HR approval to send.")

        employee.status = "documents_pending"
        db.commit()
        return {"status": "awaiting_documents", "missing_documents": missing_docs}

    _mark(db, employee_id, STEP_VALIDATION, "completed")
    _audit(db, employee_id, "Validation Agent", "Employee validated", "All mandatory fields and documents present.")
    return _continue_after_validation(db, employee)


def _resolve_role(db: Session, employee: Employee):
    """Role comes from HRMS directly whenever possible. The AI classifier
    is FALLBACK ONLY -- invoked solely when HRMS didn't provide a role,
    the role is empty, or it doesn't match a supported role."""
    valid_roles = set(get_roles().keys())

    if employee.role and employee.role in valid_roles:
        _audit(db, employee.id, "Role Agent", f"{employee.role} provided by HRMS",
               "Role came directly from HRMS; AI classification skipped.")
        return

    reason = "No role provided by HRMS." if not employee.role else f"HRMS role '{employee.role}' is not a supported role."
    classification = classify_role(employee.department, employee.title, employee.office)
    employee.role = classification["role"]
    db.add(RoleClassification(
        employee_id=employee.id, predicted_role=classification["role"],
        confidence=classification.get("confidence", 0.0),
        reasoning=f"{reason} Fallback classification: {classification.get('reasoning', '')}",
    ))
    db.commit()
    _audit(db, employee.id, "Role Agent", f"{classification['role']} detected (fallback)",
           f"{reason} {classification.get('reasoning', '')}")


def _continue_after_validation(db: Session, employee: Employee):
    """Resolve role (HRMS-first, AI fallback), then fan out into the 4
    parallel tracks. Every task is created 'pending' -- nothing here
    approves anything; that only happens in the Approval Dashboard."""
    employee_id = employee.id

    _resolve_role(db, employee)
    db.commit()

    is_fresher = employee.experience_level == "fresher"

    access = recommend_access(employee.role)
    db.add(AccessRecommendation(
        employee_id=employee_id, applications=json.dumps(access["applications"]),
        security_groups=json.dumps(access["security_groups"]),
        ethical_wall_rules=json.dumps(access["ethical_wall_rules"]), reasoning=access["reasoning"],
    ))
    db.commit()

    hardware = recommend_hardware(employee.role)
    db.add(AssetAllocation(employee_id=employee_id, asset_list=json.dumps(hardware["asset_list"])))
    db.commit()

    compliance_items = recommend_compliance(employee.role)

    # --- HR track ---
    _mark(db, employee_id, STEP_HR_TRACK, "running")
    _add_task(db, employee_id, "HR", "Verify Documents", is_ai_generated=True,
              ai_recommendation="All required documents confirmed present at validation.")
    for item_name in compliance_items:
        _add_task(db, employee_id, "HR", item_name, is_ai_generated=True, category="compliance",
                  ai_recommendation=f"Recommended for role '{employee.role}' as part of standard compliance.")
    _add_task(db, employee_id, "HR", "Complete Documentation")
    if is_fresher:
        _add_task(db, employee_id, "HR", "Additional Learning Modules", is_mandatory=False, is_ai_generated=True,
                  ai_recommendation="Recommended for fresher hires -- supplementary learning content beyond standard compliance.")
    _mark(db, employee_id, STEP_HR_TRACK, "completed")
    _audit(db, employee_id, "HR Track", "Task list generated", "Tasks created for HR")

    # --- IT track ---
    _mark(db, employee_id, STEP_IT_TRACK, "running")
    _add_task(db, employee_id, "IT", "Create User Account")
    _add_task(db, employee_id, "IT", "Create Active Directory Account", is_ai_generated=True,
              ai_recommendation=f"Mock AD account request for '{employee.role}' in {employee.department}.")
    _add_task(db, employee_id, "IT", "Create Microsoft 365 Account", is_ai_generated=True,
              ai_recommendation=f"Mock M365 provisioning request for '{employee.role}'.")
    _add_task(db, employee_id, "IT", "Create Email Account", is_ai_generated=True,
              ai_recommendation=f"Mock email account provisioning for {employee.email}.")
    _add_task(db, employee_id, "IT", "Create VPN Account", is_ai_generated=True,
              ai_recommendation=f"Mock VPN account request for '{employee.role}'.")
    _add_task(db, employee_id, "IT", "Assign Applications", is_ai_generated=True, ai_recommendation=access["reasoning"],
              task_type="multi_select", options=get_all_applications(), selected_options=access["applications"])
    _add_task(db, employee_id, "IT", "Create Application Accounts", is_ai_generated=True,
              ai_recommendation=(f"Mock account creation for the applications assigned above: "
                                  f"{', '.join(access['applications'])}."),
              task_type="multi_select", options=get_all_applications(), selected_options=access["applications"])
    _add_task(db, employee_id, "IT", "Asset Allocation", is_ai_generated=True,
              ai_recommendation=f"Recommended assets for '{employee.role}': {', '.join(hardware['asset_list'])}",
              task_type="multi_select", options=get_all_assets(), selected_options=hardware["asset_list"])
    _mark(db, employee_id, STEP_IT_TRACK, "completed")
    _audit(db, employee_id, "IT Track", "Task list generated", "Tasks created for IT")

    # --- Security track ---
    _mark(db, employee_id, STEP_SECURITY_TRACK, "running")
    _add_task(db, employee_id, "Security", "Assign Security Groups", is_ai_generated=True, ai_recommendation=access["reasoning"],
              task_type="multi_select", options=get_all_security_groups(), selected_options=access["security_groups"])
    if access["ethical_wall_rules"]:
        ethical_wall_note = (f"Legal role -- allowed: {access['ethical_wall_rules']['allowed']}, "
                              f"restricted: {access['ethical_wall_rules']['restricted']}")
    else:
        ethical_wall_note = "Not applicable -- non-legal role."
    _add_task(db, employee_id, "Security", "Ethical Wall Assignment", is_ai_generated=True, ai_recommendation=ethical_wall_note)
    privileged_review = review_privileged_access(employee.role, access["security_groups"])
    _add_task(db, employee_id, "Security", "Privileged Access Review", is_ai_generated=True,
              ai_recommendation=privileged_review["reasoning"])
    _mark(db, employee_id, STEP_SECURITY_TRACK, "completed")
    _audit(db, employee_id, "Security Track", "Task list generated", "Tasks created for Security")

    # --- Manager track ---
    _mark(db, employee_id, STEP_MANAGER_TRACK, "running")

    projects = recommend_projects(employee.role, employee.department, employee.experience_level)
    project_lines = [f"{r['project']}: {r['reasoning']}" for r in projects["recommendations"]]
    top_pick = projects["recommendations"][0]["project"] if projects["recommendations"] else None
    _add_task(db, employee_id, "Manager", "Project Recommendation", is_ai_generated=True,
              ai_recommendation=" | ".join(project_lines),
              task_type="single_select", options=get_all_project_names(),
              selected_options=[top_pick] if top_pick else [])

    induction_note = f"Suggested induction date: {employee.joining_date or 'TBD'} (employee's joining date)."
    _add_task(db, employee_id, "Manager", "Schedule Induction", is_ai_generated=True, ai_recommendation=induction_note)

    if is_fresher:
        _add_task(db, employee_id, "Manager", "Mandatory Induction Session", is_ai_generated=True,
                  ai_recommendation="Required for fresher hires -- structured onboarding session before independent work begins.")

    intro = draft_team_intro(employee.name, employee.role, employee.department, employee.joining_date)
    _add_task(db, employee_id, "Manager", "Team Introduction", is_mandatory=False, is_ai_generated=True,
              ai_recommendation=intro["intro_text"])

    _mark(db, employee_id, STEP_MANAGER_TRACK, "completed")
    _audit(db, employee_id, "Manager Track", "Task list generated", "Tasks created for Manager")

    employee.status = "onboarding"
    db.commit()

    return {"status": "in_progress", "role": employee.role}


def resume_after_documents(db: Session, employee_id: str):
    """HR confirms documents were received -- resumes a paused pipeline.
    No email involved (that whole mechanic was removed); this is purely
    a status check + resume."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise ValueError(f"Employee {employee_id} not found")

    pending_docs = db.query(EmployeeDocument).filter(
        EmployeeDocument.employee_id == employee_id, EmployeeDocument.status == "pending"
    ).all()
    if not pending_docs:
        raise ValueError("No pending documents to mark as received for this employee")

    for doc in pending_docs:
        doc.status = "received"
        doc.received_at = datetime.datetime.utcnow()
    db.commit()

    submitted = json.loads(employee.documents_submitted) if employee.documents_submitted else []
    submitted.extend([d.document_name for d in pending_docs])
    employee.documents_submitted = json.dumps(submitted)
    db.commit()

    _mark(db, employee_id, STEP_VALIDATION, "completed")
    _audit(db, employee_id, "Validation Agent", "Documents received",
           "Missing documents confirmed received; validation completed.")

    return _continue_after_validation(db, employee)

def create_document_review_task(db: Session, employee_id: str, auto_matched_names: list[str], unmatched_count: int = 0):
    note = ""
    if auto_matched_names:
        note += f"Automatically matched: {', '.join(auto_matched_names)}. "
    if unmatched_count > 0:
        note += (
            f"{unmatched_count} received file(s) could not be auto-matched (multiple files/documents "
            f"in play) -- use the matching tool below to assign each file to the correct document "
            f"before approving."
        )
    _add_task(
        db, employee_id, "HR", "Review Received Documents",
        is_ai_generated=True, task_type="document_match",
        ai_recommendation=note or "Documents received via email -- review before approving.",
    )
    _audit(db, employee_id, "Document Reply Handler", "Documents received via email", note)

def _draft_and_queue_missing_document_email(db: Session, employee: Employee, missing_docs: list[str]):
    """Drafts (via Ollama) and stages an HR-approval email task for the
    given missing documents. Used both on initial Validation (first
    request) and after a partial reply (follow-up request for whatever
    is still missing) -- same mechanism, reusable, so the request/reply
    loop is self-sustaining until everything required is received."""
    existing_draft = db.query(DocumentRequestEmail).filter(
        DocumentRequestEmail.employee_id == employee.id, DocumentRequestEmail.status == "drafted"
    ).first()
    if existing_draft:
        return  # already have an unsent draft awaiting HR approval -- don't duplicate
    draft = draft_document_request_email(employee.name, missing_docs)
    email_record = DocumentRequestEmail(
        employee_id=employee.id, subject=draft["subject"], body=draft["body"], status="drafted",
    )
    db.add(email_record)
    db.commit()

    _add_task(
        db, employee.id, "HR", "Missing Document Request Email",
        is_ai_generated=True, task_type="email_draft",
        ai_recommendation=f"Drafted for missing: {', '.join(missing_docs)}. Review and approve to send.",
    )
    _audit(db, employee.id, "Validation Agent", "Document request email drafted",
           f"Missing: {', '.join(missing_docs)}")


def _draft_and_queue_welcome_email(db: Session, employee: Employee):
    """One welcome email per onboarding -- guarded the same way as the
    document-request draft (skip if one already exists for this
    employee), since run_onboarding() itself is already guarded against
    re-running for a non-'registered' employee, but this stays defensive
    in case of a retried/duplicate call."""
    existing = db.query(WelcomeEmail).filter(WelcomeEmail.employee_id == employee.id).first()
    if existing:
        return
    draft = draft_welcome_email(employee.name, employee.role, employee.department,
                                 employee.joining_date, employee.manager)
    db.add(WelcomeEmail(employee_id=employee.id, subject=draft["subject"], body=draft["body"], status="drafted"))
    db.commit()

    _add_task(
        db, employee.id, "HR", "Welcome Email",
        is_mandatory=False, is_ai_generated=True, task_type="email_draft",
        ai_recommendation="Drafted welcome email for the new hire. Review and approve to send.",
    )
    _audit(db, employee.id, "Welcome Email Agent", "Welcome email drafted", "")


def draft_and_queue_feedback_email(db: Session, employee: Employee):
    """Fires once an employee reaches 'active' status (called from the
    router right after recompute_employee_status flips it) -- not
    module-private since routers/onboarding.py needs to call it
    directly, unlike the other _draft_and_queue_* helpers which are
    only ever called from within this orchestrator."""
    existing = db.query(FeedbackEmail).filter(FeedbackEmail.employee_id == employee.id).first()
    if existing:
        return
    draft = draft_feedback_request_email(employee.name)
    db.add(FeedbackEmail(employee_id=employee.id, subject=draft["subject"], body=draft["body"], status="drafted"))
    db.commit()

    _add_task(
        db, employee.id, "HR", "Onboarding Feedback Request",
        is_mandatory=False, is_ai_generated=True, task_type="email_draft",
        ai_recommendation="Drafted onboarding feedback request. Review and approve to send.",
    )
    _audit(db, employee.id, "Feedback Survey Agent", "Feedback request email drafted", "")