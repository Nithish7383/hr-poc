from pydantic import json_schema
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import datetime
import os
import re
import json
from app import email_client
from app.config import get_document_keywords
from app.database import get_db
from app.models import (
    OnboardingTracker, Employee, EmployeeDocument, OnboardingTask, DocumentRequestEmail, ReceivedAttachment,
    WelcomeEmail, FeedbackEmail, FeedbackResponse,
)
from app.schemas.employee import TaskDecision, TaskSelectionUpdate, EmailDraftUpdate
from app.orchestrators.onboarding_orchestrator import (
    run_onboarding, resume_after_documents, create_document_review_task, resume_after_documents,
    _draft_and_queue_missing_document_email, draft_and_queue_feedback_email,
)
from app.services.track_status import get_all_track_statuses, recompute_employee_status
from app.services.license_manager import allocate_seats
from app.agents.feedback_survey_agent import summarize_feedback_response

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


# @router.post("/{employee_id}/documents/mark-received")
# def mark_documents_received(employee_id: str, db: Session = Depends(get_db)):
#     """HR confirms documents were received -- resumes a paused pipeline."""
#     employee = db.query(Employee).filter(Employee.id == employee_id).first()
#     if not employee:
#         raise HTTPException(status_code=404, detail="Employee not found")
#     try:
#         return resume_after_documents(db, employee_id)
#     except ValueError as e:
#         raise HTTPException(status_code=400, detail=str(e))


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
        entry = {
            "id": t.id, "task_name": t.task_name, "status": t.status,
            "is_mandatory": t.is_mandatory,
            "is_ai_generated": t.is_ai_generated == "true",
            "ai_recommendation": t.ai_recommendation,
            "task_type": t.task_type,
            "options": _json.loads(t.options) if t.options else None,
            "selected_options": _json.loads(t.selected_options) if t.selected_options else None,
            "category": t.category,
            "created_at": t.created_at, "decided_at": t.decided_at,
        }

        if t.task_type == "email_draft":
            if t.task_name == "Welcome Email":
                email_record = (
                    db.query(WelcomeEmail)
                    .filter(WelcomeEmail.employee_id == employee_id)
                    .order_by(WelcomeEmail.generated_at.desc())
                    .first()
                )
            elif t.task_name == "Onboarding Feedback Request":
                email_record = (
                    db.query(FeedbackEmail)
                    .filter(FeedbackEmail.employee_id == employee_id)
                    .order_by(FeedbackEmail.generated_at.desc())
                    .first()
                )
            else:  # "Missing Document Request Email"
                email_record = (
                    db.query(DocumentRequestEmail)
                    .filter(DocumentRequestEmail.employee_id == employee_id)
                    .order_by(DocumentRequestEmail.generated_at.desc())
                    .first()
                )
            if email_record:
                entry["email_subject"] = email_record.subject
                entry["email_body"] = email_record.body
                entry["email_status"] = email_record.status

        by_track.setdefault(t.track, []).append(entry)

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
    
    # --- NEW: seat allocation when applications assigned ---
    if task.task_name == "Assign Applications" and payload.status == "approved":
        app_names = json.loads(task.selected_options) if task.selected_options else []
        if app_names:
            allocate_seats(db, app_names)

    if task.task_type == "email_draft" and payload.status == "approved":
        # Dispatch by task_name -- there are now three kinds of email_draft
        # task (document request, welcome, feedback request), each backed
        # by its own table, so "most recent drafted" is no longer
        # unambiguous the way it was when only document requests existed.
        if task.task_name == "Welcome Email":
            email_record = (
                db.query(WelcomeEmail)
                .filter(WelcomeEmail.employee_id == employee_id, WelcomeEmail.status == "drafted")
                .order_by(WelcomeEmail.generated_at.desc())
                .first()
            )
            if email_record:
                employee = db.query(Employee).filter(Employee.id == employee_id).first()
                try:
                    email_client.send_email(employee.email, email_record.subject, email_record.body)
                    email_record.status = "sent"
                    email_record.sent_at = datetime.datetime.utcnow()
                    db.commit()
                except email_client.EmailClientError as e:
                    raise HTTPException(status_code=502, detail=f"Email send failed: {e}")

        elif task.task_name == "Onboarding Feedback Request":
            email_record = (
                db.query(FeedbackEmail)
                .filter(FeedbackEmail.employee_id == employee_id, FeedbackEmail.status == "drafted")
                .order_by(FeedbackEmail.generated_at.desc())
                .first()
            )
            if email_record:
                employee = db.query(Employee).filter(Employee.id == employee_id).first()
                try:
                    message_id = email_client.send_email(employee.email, email_record.subject, email_record.body)
                    email_record.status = "sent"
                    email_record.message_id = message_id
                    email_record.sent_at = datetime.datetime.utcnow()
                    db.commit()
                except email_client.EmailClientError as e:
                    raise HTTPException(status_code=502, detail=f"Email send failed: {e}")

        else:  # "Missing Document Request Email" -- the original behavior
            email_record = (
                db.query(DocumentRequestEmail)
                .filter(DocumentRequestEmail.employee_id == employee_id, DocumentRequestEmail.status == "drafted")
                .order_by(DocumentRequestEmail.generated_at.desc())
                .first()
            )
            if email_record:
                employee = db.query(Employee).filter(Employee.id == employee_id).first()
                try:
                    message_id = email_client.send_email(employee.email, email_record.subject, email_record.body)
                    email_record.status = "sent"
                    email_record.message_id = message_id
                    email_record.sent_at = datetime.datetime.utcnow()
                    db.commit()
                except email_client.EmailClientError as e:
                    raise HTTPException(status_code=502, detail=f"Email send failed: {e}")

    if task.task_name == "Review Received Documents" and payload.status == "approved":
        under_review_docs = db.query(EmployeeDocument).filter(
            EmployeeDocument.employee_id == employee_id, EmployeeDocument.status == "under_review"
        ).all()
        for doc in under_review_docs:
            doc.status = "received"
        db.commit()
        try:
            resume_after_documents(db, employee_id)
        except ValueError:
            pass

    employee_before = db.query(Employee).filter(Employee.id == employee_id).first()
    was_active = employee_before.status == "active" if employee_before else False

    recompute_employee_status(db, employee_id)

    employee_after = db.query(Employee).filter(Employee.id == employee_id).first()
    if employee_after and employee_after.status == "active" and not was_active:
        draft_and_queue_feedback_email(db, employee_after)

    return {"id": task.id, "task_name": task.task_name, "status": task.status}

@router.patch("/{employee_id}/documents/email-draft")
def update_email_draft(employee_id: str, payload: EmailDraftUpdate, db: Session = Depends(get_db)):
    email_record = (
        db.query(DocumentRequestEmail)
        .filter(DocumentRequestEmail.employee_id == employee_id, DocumentRequestEmail.status == "drafted")
        .order_by(DocumentRequestEmail.generated_at.desc())
        .first()
    )
    if not email_record:
        raise HTTPException(status_code=404, detail="No drafted email found for this employee")
    email_record.subject = payload.subject
    email_record.body = payload.body
    db.commit()
    return {"subject": email_record.subject, "body": email_record.body}


@router.patch("/{employee_id}/tasks/{task_id}/email-draft")
def update_task_email_draft(employee_id: str, task_id: str, payload: EmailDraftUpdate, db: Session = Depends(get_db)):
    """Generic version of the endpoint above, covering all three
    email_draft task kinds (Welcome Email / Onboarding Feedback Request /
    Missing Document Request Email) by resolving through the task
    itself rather than assuming DocumentRequestEmail. Only edits drafts
    that haven't been sent yet -- once sent, the record is a historical
    fact, not something to rewrite."""
    task = db.query(OnboardingTask).filter(
        OnboardingTask.id == task_id, OnboardingTask.employee_id == employee_id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.task_type != "email_draft":
        raise HTTPException(status_code=400, detail="This task is not an email draft task")

    model_by_task_name = {
        "Welcome Email": WelcomeEmail,
        "Onboarding Feedback Request": FeedbackEmail,
    }
    email_model = model_by_task_name.get(task.task_name, DocumentRequestEmail)

    email_record = (
        db.query(email_model)
        .filter(email_model.employee_id == employee_id, email_model.status == "drafted")
        .order_by(email_model.generated_at.desc())
        .first()
    )
    if not email_record:
        raise HTTPException(status_code=404, detail="No drafted (unsent) email found for this task")
    email_record.subject = payload.subject
    email_record.body = payload.body
    db.commit()
    return {"subject": email_record.subject, "body": email_record.body, "status": email_record.status}


def _safe_filename(employee_id: str, doc_index: int, extension: str) -> str:
    return f"{employee_id}_{doc_index}{extension}"

@router.post("/{employee_id}/documents/check-inbox")
def check_inbox_for_employee(employee_id: str, db: Session = Depends(get_db)):
    email_record = (
        db.query(DocumentRequestEmail)
        .filter(DocumentRequestEmail.employee_id == employee_id, DocumentRequestEmail.status == "sent")
        .order_by(DocumentRequestEmail.sent_at.desc())
        .first()
    )
    if not email_record or not email_record.message_id:
        return {"checked": True, "reply_found": False, "reason": "No sent email awaiting reply for this employee"}
    
    claimed = db.query(DocumentRequestEmail).filter(
        DocumentRequestEmail.id == email_record.id, DocumentRequestEmail.status == "sent"
    ).update({"status": "checking"})
    db.commit()
    if claimed == 0:
        return {"checked": True, "reply_found": False, "reason": "Already being checked by another request right now"}
    
    try:
        reply = email_client.check_for_reply(email_record.message_id)
    except email_client.EmailClientError as e:
        email_record.status = "sent"
        db.commit()
        raise HTTPException(status_code=502, detail=str(e))

    if not reply or not reply["attachments"]:
        email_record.status = "sent"
        db.commit()
        return {"checked": True, "reply_found": False}

    upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", employee_id)
    os.makedirs(upload_dir, exist_ok=True)

    pending_docs = db.query(EmployeeDocument).filter(
        EmployeeDocument.employee_id == employee_id, EmployeeDocument.status == "pending"
    ).all()

    saved_attachments = []
    for idx, attachment in enumerate(reply["attachments"]):
        safe_name = _safe_filename(employee_id, idx, attachment["extension"])
        filepath = os.path.join(upload_dir, safe_name)
        with open(filepath, "wb") as f:
            f.write(attachment["content"])
        record = ReceivedAttachment(
            employee_id=employee_id, file_path=filepath,
            original_filename=attachment["original_filename"],
        )
        db.add(record)
        saved_attachments.append(record)
    db.commit()

    unassigned_attachments = list(saved_attachments)
    newly_matched = []

    if len(saved_attachments) == 1 and len(pending_docs) == 1:
        # Genuinely unambiguous regardless of filename -- skip keyword matching
        attachment_record = saved_attachments[0]
        doc = pending_docs[0]
        doc.status = "under_review"
        doc.file_path = attachment_record.file_path
        attachment_record.matched_document_name = doc.document_name
        newly_matched.append(doc.document_name)
        unassigned_attachments.remove(attachment_record)
    else:
        # Interim filename-keyword heuristic -- Mohan's real document
        # validator will replace this with actual content verification.
        keywords_by_doc = get_document_keywords()
        for doc in pending_docs:
            match = next(
                (a for a in unassigned_attachments
                 if _match_attachment_by_keywords(doc.document_name, a.original_filename, keywords_by_doc)),
                None,
            )
            if match:
                doc.status = "under_review"
                doc.file_path = match.file_path
                match.matched_document_name = doc.document_name
                newly_matched.append(doc.document_name)
                unassigned_attachments.remove(match)

    db.commit()

    email_record.status = "replied"
    email_record.replied_at = datetime.datetime.utcnow()
    db.commit()

    # Whatever's still pending after matching -- automatically draft a
    # follow-up email requesting just those, so the employee doesn't
    # have to guess what's still outstanding. Self-sustaining loop.
    still_missing = [d.document_name for d in pending_docs if d.status == "pending"]
    if still_missing:
        employee = db.query(Employee).filter(Employee.id == employee_id).first()
        _draft_and_queue_missing_document_email(db, employee, still_missing)

    if newly_matched:
        create_document_review_task(db, employee_id, newly_matched, unmatched_count=len(unassigned_attachments))

    return {
        "checked": True, "reply_found": True,
        "attachments_received": len(saved_attachments),
        "auto_matched": newly_matched,
        "still_missing": still_missing,
        "needs_manual_matching": len(unassigned_attachments),
    }

@router.get("/{employee_id}/documents/{doc_id}/file")
def download_received_document(employee_id: str, doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(EmployeeDocument).filter(
        EmployeeDocument.id == doc_id, EmployeeDocument.employee_id == employee_id
    ).first()
    if not doc or not doc.file_path:
        raise HTTPException(status_code=404, detail="No file on record for this document")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File missing from disk")
    return FileResponse(doc.file_path)

@router.post("/{employee_id}/documents/{doc_id}/match-attachment")
def match_attachment_to_document(employee_id: str, doc_id: str, attachment_id: str, db: Session = Depends(get_db)):
    doc = db.query(EmployeeDocument).filter(
        EmployeeDocument.id == doc_id, EmployeeDocument.employee_id == employee_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    attachment_record = db.query(ReceivedAttachment).filter(
        ReceivedAttachment.id == attachment_id, ReceivedAttachment.employee_id == employee_id,
        ReceivedAttachment.matched_document_name.is_(None),
    ).first()
    if not attachment_record:
        raise HTTPException(status_code=404, detail="Attachment not found or already matched to a document")

    doc.status = "under_review"
    doc.file_path = attachment_record.file_path
    attachment_record.matched_document_name = doc.document_name
    db.commit()
    return {"document_name": doc.document_name, "matched": True}


@router.get("/{employee_id}/documents/unmatched-attachments")
def get_unmatched_attachments(employee_id: str, db: Session = Depends(get_db)):
    attachments = db.query(ReceivedAttachment).filter(
        ReceivedAttachment.employee_id == employee_id, ReceivedAttachment.matched_document_name.is_(None),
    ).all()
    return [{"id": a.id, "original_filename": a.original_filename, "received_at": a.received_at} for a in attachments]

def _match_attachment_by_keywords(document_name: str, filename: str, keywords_by_doc: dict) -> bool:
    filename_lower = (filename or "").lower()
    keywords = keywords_by_doc.get(document_name, [])
    return any(kw in filename_lower for kw in keywords)


@router.post("/{employee_id}/feedback/check-inbox")
def check_feedback_inbox(employee_id: str, db: Session = Depends(get_db)):
    """Mirrors check_inbox_for_employee's atomic-claim pattern (sent ->
    checking, rowcount-checked update) to avoid the same duplicate-reply
    race condition that was fixed for document replies -- both the
    60s auto-poller and this manual button can call this concurrently."""
    email_record = (
        db.query(FeedbackEmail)
        .filter(FeedbackEmail.employee_id == employee_id, FeedbackEmail.status == "sent")
        .order_by(FeedbackEmail.sent_at.desc())
        .first()
    )
    if not email_record or not email_record.message_id:
        return {"checked": True, "reply_found": False, "reason": "No sent feedback request awaiting reply for this employee"}

    claimed = db.query(FeedbackEmail).filter(
        FeedbackEmail.id == email_record.id, FeedbackEmail.status == "sent"
    ).update({"status": "checking"})
    db.commit()
    if claimed == 0:
        return {"checked": True, "reply_found": False, "reason": "Already being checked by another request right now"}

    try:
        reply = email_client.check_for_reply(email_record.message_id)
    except email_client.EmailClientError as e:
        email_record.status = "sent"
        db.commit()
        raise HTTPException(status_code=502, detail=str(e))

    if not reply or not reply.get("body_text"):
        email_record.status = "sent"
        db.commit()
        return {"checked": True, "reply_found": False}

    summary = summarize_feedback_response(reply["body_text"])
    db.add(FeedbackResponse(
        employee_id=employee_id, feedback_email_id=email_record.id,
        raw_text=reply["body_text"], summary=summary.get("summary"), sentiment=summary.get("sentiment"),
    ))
    email_record.status = "replied"
    email_record.replied_at = datetime.datetime.utcnow()
    db.commit()

    return {"checked": True, "reply_found": True, "summary": summary.get("summary"), "sentiment": summary.get("sentiment")}


@router.get("/{employee_id}/feedback")
def get_feedback_for_employee(employee_id: str, db: Session = Depends(get_db)):
    response = (
        db.query(FeedbackResponse)
        .filter(FeedbackResponse.employee_id == employee_id)
        .order_by(FeedbackResponse.received_at.desc())
        .first()
    )
    if not response:
        return None
    return {
        "raw_text": response.raw_text, "summary": response.summary,
        "sentiment": response.sentiment, "received_at": response.received_at,
    }