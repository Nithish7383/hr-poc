"""
Two periodic sweeps, both called from a background loop in main.py
(same asyncio pattern as the existing inbox poller):

- send_document_reminders: if a "Missing Document Request Email" got no
  reply within REMINDER_HOURS, re-send it once as a reminder (employee
  is the only human who can actually act on this -- there's no employee
  portal, email is the only surface they have).
- escalate_overdue_tasks: if a pending approval task (either onboarding
  or offboarding) has sat unresolved past ESCALATION_HOURS, notify the
  responsible track's inbox. One email per employee+track, one-shot per
  task (escalated_at), same "fire once on crossing" shape as the
  license low-seat alert.

Both use a rowcount-checked update as the atomic claim, same pattern
used for the document-reply race fix, to stay safe if this sweep is
ever triggered from more than one place.
"""
import os
import datetime
from collections import defaultdict
from sqlalchemy.orm import Session
from app.models import DocumentRequestEmail, OnboardingTask, OffboardingTask, Employee
from app import email_client

REMINDER_HOURS = float(os.getenv("REMINDER_HOURS", "48"))
MAX_REMINDERS = int(os.getenv("MAX_REMINDERS", "1"))
ESCALATION_HOURS = float(os.getenv("ESCALATION_HOURS", "72"))

TRACK_EMAIL_ENV = {
    "HR": "HR_TEAM_EMAIL",
    "IT": "IT_TEAM_EMAIL",  # already used by license_manager.py for low-seat alerts
    "Security": "SECURITY_TEAM_EMAIL",
    "Manager": "MANAGER_TEAM_EMAIL",
}


def _reminder_body(original_subject: str, original_body: str) -> tuple[str, str]:
    subject = f"Reminder: {original_subject}"
    body = (
        f"Hi,\n\nJust following up on the note below -- we haven't heard back yet. "
        f"If you've already sent the document(s), please disregard this reminder.\n\n"
        f"---- Original message ----\n{original_body}"
    )
    return subject, body


def send_document_reminders(db: Session):
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=REMINDER_HOURS)
    candidates = db.query(DocumentRequestEmail).filter(
        DocumentRequestEmail.status == "sent",
        DocumentRequestEmail.reminder_count < MAX_REMINDERS,
    ).all()

    for record in candidates:
        last_activity = record.last_reminder_at or record.sent_at
        if not last_activity or last_activity > cutoff:
            continue

        claimed = db.query(DocumentRequestEmail).filter(
            DocumentRequestEmail.id == record.id,
            DocumentRequestEmail.reminder_count == record.reminder_count,
        ).update({"reminder_count": record.reminder_count + 1})
        db.commit()
        if claimed == 0:
            continue  # lost the race to another sweep -- skip, already handled

        employee = db.query(Employee).filter(Employee.id == record.employee_id).first()
        if not employee:
            continue
        subject, body = _reminder_body(record.subject, record.body)
        try:
            email_client.send_email(employee.email, subject, body)
            record.last_reminder_at = datetime.datetime.utcnow()
            db.commit()
        except email_client.EmailClientError as e:
            print(f"[REMINDER] Failed to send reminder for employee {record.employee_id}: {e}")


def _escalation_body(employee: Employee, tasks: list) -> str:
    task_lines = "\n".join(f"  - {t.task_name} (pending since {t.created_at})" for t in tasks)
    return (
        f"The following task(s) for {employee.name} ({employee.employee_id}) have been "
        f"pending for over {ESCALATION_HOURS:.0f} hours and need attention:\n\n{task_lines}"
    )


def _escalate_for_model(db: Session, task_model, workflow_label: str):
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=ESCALATION_HOURS)
    overdue = db.query(task_model).filter(
        task_model.status == "pending",
        task_model.escalated_at.is_(None),
        task_model.created_at <= cutoff,
    ).all()
    if not overdue:
        return

    claimed_tasks = []
    for task in overdue:
        claimed = db.query(task_model).filter(
            task_model.id == task.id, task_model.escalated_at.is_(None),
        ).update({"escalated_at": datetime.datetime.utcnow()})
        db.commit()
        if claimed:
            claimed_tasks.append(task)

    grouped = defaultdict(list)
    for task in claimed_tasks:
        grouped[(task.employee_id, task.track)].append(task)

    for (employee_id, track), tasks in grouped.items():
        employee = db.query(Employee).filter(Employee.id == employee_id).first()
        if not employee:
            continue
        recipient = os.getenv(TRACK_EMAIL_ENV.get(track, ""), "")
        if not recipient:
            continue
        subject = f"[{workflow_label}] Overdue task(s) for {employee.name} -- {track} track"
        body = _escalation_body(employee, tasks)
        try:
            email_client.send_email(recipient, subject, body)
        except email_client.EmailClientError as e:
            print(f"[ESCALATION] Failed to send escalation for employee {employee_id}: {e}")


def escalate_overdue_tasks(db: Session):
    _escalate_for_model(db, OnboardingTask, "Onboarding")
    _escalate_for_model(db, OffboardingTask, "Offboarding")
