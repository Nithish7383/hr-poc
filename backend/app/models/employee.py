"""
Core SQLAlchemy models. Matches the schema in POC_Technical_Architecture.md section 4.
"""
import datetime
import uuid
from sqlalchemy import Column, String, DateTime, Float, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from app.database import Base


def gen_id():
    return str(uuid.uuid4())


class Employee(Base):
    __tablename__ = "employees"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    employee_id = Column(String, unique=True, nullable=False)
    email = Column(String, nullable=False)
    department = Column(String, nullable=False)
    title = Column(String, nullable=True)
    role = Column(String, nullable=True)          # from HRMS directly if provided; AI classifier is fallback-only (see role_classifier usage in orchestrator)
    experience_level = Column(String, nullable=True)  # "fresher" | "experienced" -- from HRMS if provided, else derived; stored (not recomputed) so any agent can read it directly
    office = Column(String, nullable=True)
    manager = Column(String, nullable=True)
    joining_date = Column(String, nullable=True)
    sync_source = Column(String, default="manual")  # "manual" | "hrms"
    status = Column(String, default="registered")   # registered -> documents_pending -> onboarding -> active -> offboarding -> exited
    activated_at = Column(DateTime, nullable=True)  # set when status flips to 'active' -- lets AI Insights compute real onboarding duration per department
    documents_submitted = Column(Text, nullable=True)  # JSON-encoded list, as reported by HRMS/manual entry at registration time
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class RoleClassification(Base):
    __tablename__ = "role_classifications"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    predicted_role = Column(String, nullable=False)
    confidence = Column(Float, default=0.0)
    reasoning = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AccessRecommendation(Base):
    __tablename__ = "access_recommendations"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    applications = Column(Text, nullable=True)        # JSON-encoded list
    security_groups = Column(Text, nullable=True)      # JSON-encoded list
    ethical_wall_rules = Column(Text, nullable=True)   # JSON-encoded dict
    reasoning = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AssetAllocation(Base):
    __tablename__ = "asset_allocations"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    asset_list = Column(Text, nullable=True)   # JSON-encoded list
    status = Column(String, default="pending")  # pending | allocated | returned | damaged | pending_return
    pending_return_at = Column(DateTime, nullable=True)  # set when status flips to pending_return during offboarding -- lets AI Insights flag overdue returns
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ComplianceTask(Base):
    __tablename__ = "compliance_tasks"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    task_name = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending | completed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class OnboardingTracker(Base):
    __tablename__ = "onboarding_tracker"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    step = Column(String, nullable=False)
    status = Column(String, default="waiting")  # waiting | running | completed | failed
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)


class OffboardingTracker(Base):
    __tablename__ = "offboarding_tracker"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    step = Column(String, nullable=False)
    status = Column(String, default="waiting")
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)


class ExitRequest(Base):
    __tablename__ = "exit_requests"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    last_working_day = Column(String, nullable=True)
    exit_reason = Column(String, nullable=True)
    sync_source = Column(String, default="manual")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    risk_level = Column(String, nullable=False)  # High | Medium | Low
    factors = Column(Text, nullable=True)          # JSON-encoded list
    reasoning = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    workflow_type = Column(String, nullable=False)   # onboarding | offboarding
    approver_role = Column(String, nullable=False)    # HR | Manager | IT | Security
    status = Column(String, default="pending")         # pending | approved | rejected
    decided_at = Column(DateTime, nullable=True)


class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    report_type = Column(String, nullable=False)  # onboarding | offboarding
    file_path = Column(String, nullable=False)
    generated_at = Column(DateTime, default=datetime.datetime.utcnow)


class EmployeeDocument(Base):
    """Tracks each required document's status for one employee. Rows are
    created when Validation first runs and finds a document missing --
    documents the employee already had at registration never get a row
    here (they're just implicitly satisfied), only the gaps are tracked."""
    __tablename__ = "employee_documents"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    document_name = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending | received
    requested_at = Column(DateTime, default=datetime.datetime.utcnow)
    received_at = Column(DateTime, nullable=True)


class OnboardingTask(Base):
    """One row per task per track (HR/IT/Security/Manager). This is the
    single source of truth both the Onboarding Tracker (read-only display)
    and the Approval Dashboard (the only place status changes) read from.

    status is an APPROVAL state, not a completion state:
    pending | approved | rejected. The Approval Dashboard is the only
    writer; the Tracker only ever reads. Track/employee completion is
    computed live from these rows (see services/track_status.py), never
    cached, to avoid the class of bug where a stored percentage drifts
    out of sync with the real data.

    task_type distinguishes how the Approval Dashboard should render and
    let the approver interact with a task -- "simple" tasks are just
    approve/reject with AI reasoning shown; "multi_select" tasks (Assign
    Applications, Asset Allocation, Assign Security Groups) let the
    approver edit a checklist before approving, pre-filled with the AI's
    suggestion; "single_select" (Project Recommendation) is a dropdown
    over the full catalog, pre-filled with the AI's top pick. This is
    the "AI suggests, human decides and can change it" pattern applied
    consistently, not just for projects.

    category marks which onboarding-task rows represent compliance items
    specifically (so compliance completion can be computed from here,
    under HR, rather than a separate untracked table nobody owns).
    """
    __tablename__ = "onboarding_tasks"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    track = Column(String, nullable=False)  # HR | IT | Security | Manager
    task_name = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending | approved | rejected
    is_mandatory = Column(Boolean, default=True)  # non-mandatory tasks (e.g. Team Introduction) don't block track completion
    is_ai_generated = Column(String, default="false")  # "true"/"false" -- whether AI produced the content for this task
    ai_recommendation = Column(Text, nullable=True)  # AI reasoning/output shown alongside the task, if any
    task_type = Column(String, default="simple")  # simple | multi_select | single_select
    options = Column(Text, nullable=True)  # JSON list -- ALL selectable values (full catalog), for multi/single_select only
    selected_options = Column(Text, nullable=True)  # JSON list -- CURRENTLY selected values, editable while status='pending'
    category = Column(String, nullable=True)  # e.g. "compliance" -- marks HR tasks that represent a compliance item
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    decided_at = Column(DateTime, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=True)
    agent = Column(String, nullable=False)
    action = Column(String, nullable=False)
    detail = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
