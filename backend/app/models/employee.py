"""
Core SQLAlchemy models. Matches the schema in POC_Technical_Architecture.md section 4.
"""
import datetime
import uuid
from sqlalchemy import Column, String, DateTime, Float, ForeignKey, Text, Boolean, Integer
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
    ssn_number = Column(String, nullable=True)  # from HRMS, used only to cross-check Government ID Proof document content (see document_identity_fields.json) -- previously silently dropped by hrms_connector
    role = Column(String, nullable=True)          # from HRMS directly if provided; AI classifier is fallback-only (see role_classifier usage in orchestrator)
    experience_level = Column(String, nullable=True)  # "fresher" | "experienced" -- from HRMS if provided, else derived; stored (not recomputed) so any agent can read it directly
    office = Column(String, nullable=True)
    manager = Column(String, nullable=True)
    joining_date = Column(String, nullable=True)
    sync_source = Column(String, default="manual")  # "manual" | "hrms"
    status = Column(String, default="registered")   # registered -> documents_pending -> onboarding -> active -> offboarding -> exited
    activated_at = Column(DateTime, nullable=True)  # set when status flips to 'active' -- lets AI Insights compute real onboarding duration per department
    documents_files = Column(Text, nullable=True)  # JSON-encoded list of HRMS-side file paths (mock_hrms/documents_files) -- consumed once by hrms_document_sync to pull real files in; NOT a completion signal by itself
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
    """Tracks each required document's status for one employee. A row
    exists for every required document type once Validation has looked
    at it -- whether it came in via HRMS sync or an email reply, and
    whether or not a file was actually found for it. Completion is
    decided by real validated evidence (status == "received", which
    only happens after HR approves a passed-or-overridden validation
    task), never by a claim from HRMS alone."""
    __tablename__ = "employee_documents"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    document_name = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending | under_review | received
    source = Column(String, default="email")  # "email" | "hrms_sync" -- where the file actually came from
    validation_status = Column(String, default="not_run")  # not_run | passed | failed
    validation_reasoning = Column(Text, nullable=True)  # AI's (or fallback's) explanation, shown to HR on the review task
    confidence = Column(String, nullable=True)  # high | medium | low -- how much to trust the validation verdict
    validated_at = Column(DateTime, nullable=True)
    requested_at = Column(DateTime, default=datetime.datetime.utcnow)
    received_at = Column(DateTime, nullable=True)
    file_path = Column(String, nullable=True)  # where the downloaded/synced file is stored, once available

class DocumentRequestEmail(Base):
    """Tracks the real email lifecycle: drafted -> sent -> replied.
    message_id is the SMTP Message-ID of the SENT email -- used to
    match the employee's reply back via In-Reply-To/References
    threading headers (see email_client.py)."""
    __tablename__ = "document_request_emails"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    status = Column(String, default="drafted")  # drafted | sent | replied
    message_id = Column(String, nullable=True)
    generated_at = Column(DateTime, default=datetime.datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
    replied_at = Column(DateTime, nullable=True)
    reminder_count = Column(Integer, default=0)  # how many reminder emails sent for this request so far
    last_reminder_at = Column(DateTime, nullable=True)  # used to compute the next reminder window


class WelcomeEmail(Base):
    """Real welcome email sent to a new hire at the start of onboarding
    (fires even if Validation is blocked on missing documents -- a
    welcome email shouldn't wait on paperwork). No reply is expected,
    so unlike DocumentRequestEmail this has no message_id/replied_at
    threading fields -- it's one-way."""
    __tablename__ = "welcome_emails"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    status = Column(String, default="drafted")  # drafted | sent
    generated_at = Column(DateTime, default=datetime.datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)


class FeedbackEmail(Base):
    """Onboarding feedback request, sent once an employee reaches
    'active' status. Mirrors DocumentRequestEmail's drafted->sent->replied
    lifecycle and threading (message_id), since we DO need to match a
    reply back to this specific request -- same mechanism, different
    purpose."""
    __tablename__ = "feedback_emails"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    status = Column(String, default="drafted")  # drafted | sent | replied
    message_id = Column(String, nullable=True)
    generated_at = Column(DateTime, default=datetime.datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
    replied_at = Column(DateTime, nullable=True)


class FeedbackResponse(Base):
    """The employee's reply to a FeedbackEmail, plus the AI's summary
    of it. raw_text is kept verbatim (auditability); summary/sentiment
    are AI-derived and shown on top of it, never replacing it."""
    __tablename__ = "feedback_responses"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    feedback_email_id = Column(String, ForeignKey("feedback_emails.id"), nullable=False)
    raw_text = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    sentiment = Column(String, nullable=True)  # positive | neutral | negative
    received_at = Column(DateTime, default=datetime.datetime.utcnow)


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
    document_id = Column(String, ForeignKey("employee_documents.id"), nullable=True)  # set only for task_type == "document_validation" -- links back to the exact document being reviewed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    decided_at = Column(DateTime, nullable=True)
    escalated_at = Column(DateTime, nullable=True)  # set once an overdue-task escalation email has fired for this task -- one-shot, same pattern as license low-seat alerts


class OffboardingTask(Base):
    """Mirrors OnboardingTask exactly, but kept as a SEPARATE table
    (deliberate choice -- onboarding and offboarding are conceptually
    distinct workflows, and a shared table with a workflow_type
    discriminator was considered and rejected in favor of this cleaner
    separation). Same fields, same semantics: status is an approval
    state (pending/approved/rejected), task_type drives editable
    selection UI the same way, category="compliance" isolates exit
    compliance items under HR the same way onboarding does."""
    __tablename__ = "offboarding_tasks"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    track = Column(String, nullable=False)  # HR | IT | Security | Manager
    task_name = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending | approved | rejected
    is_mandatory = Column(Boolean, default=True)
    is_ai_generated = Column(String, default="false")
    ai_recommendation = Column(Text, nullable=True)
    task_type = Column(String, default="simple")  # simple | multi_select | single_select
    options = Column(Text, nullable=True)
    selected_options = Column(Text, nullable=True)
    category = Column(String, nullable=True)  # e.g. "compliance"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    decided_at = Column(DateTime, nullable=True)
    escalated_at = Column(DateTime, nullable=True)  # mirrors OnboardingTask.escalated_at


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=True)
    agent = Column(String, nullable=False)
    action = Column(String, nullable=False)
    detail = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

# ==========================================================
# HR Assistant Models
# ==========================================================

class PolicyDocument(Base):
    __tablename__ = "policy_documents"

    id = Column(String, primary_key=True, default=gen_id)
    title = Column(String, nullable=False)
    filename = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    chunks = relationship(
        "PolicyChunk",
        back_populates="document",
        cascade="all, delete-orphan",
    )


class PolicyChunk(Base):
    __tablename__ = "policy_chunks"

    id = Column(String, primary_key=True, default=gen_id)
    document_id = Column(String, ForeignKey("policy_documents.id"), nullable=False)
    content = Column(Text, nullable=False)
    chunk_index = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    document = relationship(
        "PolicyDocument",
        back_populates="chunks",
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=gen_id)
    conversation_id = Column(
        String,
        ForeignKey("conversations.id"),
        nullable=False,
    )
    role = Column(String, nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    conversation = relationship(
        "Conversation",
        back_populates="messages",
    )

class ReceivedAttachment(Base):
    """A file received via email reply, not yet matched to a specific
    required document. Exists so we never guess by position -- HR
    explicitly matches each file to a document type unless there is
    exactly one file and exactly one missing document (the only truly
    unambiguous case)."""
    __tablename__ = "received_attachments"

    id = Column(String, primary_key=True, default=gen_id)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    file_path = Column(String, nullable=False)
    original_filename = Column(String, nullable=True)
    matched_document_name = Column(String, nullable=True)
    received_at = Column(DateTime, default=datetime.datetime.utcnow)

class SoftwareLicense(Base):
    """Tracks seat allocation per application/license. Seeded from
    config_data/licenses.json at first use (see services/license_manager.py).
    Seats decrement only when an Assign Applications task is APPROVED,
    not when AI merely recommends it -- matches the project-wide rule
    that nothing counts as real until a human approves it."""
    __tablename__ = "software_licenses"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False, unique=True)
    total_seats = Column(Integer, nullable=False)
    allocated_seats = Column(Integer, default=0)
    threshold = Column(Integer, default=5)
    last_alert_sent_at = Column(DateTime, nullable=True)