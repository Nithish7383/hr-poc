"""
Drafts the real welcome email sent to a new hire at the very start of
onboarding -- same drafted -> HR-approved -> real-send pattern as the
missing-document request email, just a different purpose and a
different recipient context (no reply/threading expected here).
"""
from app.ai_client import call_ollama_json, OllamaError

PROMPT_TEMPLATE = """Write a short, warm welcome email to {name}, who is
joining as {role} in the {department} department, starting {joining_date}.
Their manager is {manager}. Mention that HR/IT/Security/their manager will
be reaching out with next steps. Keep it under 100 words, friendly and
professional. Respond ONLY with JSON in this exact shape:
{{"subject": "<email subject line>", "body": "<email body text>"}}
"""


def _fallback_template(name: str, role: str, department: str, joining_date: str, manager: str) -> dict:
    return {
        "subject": f"Welcome to the team, {name}!",
        "body": (
            f"Hi {name},\n\nWelcome aboard! We're excited to have you joining as {role} "
            f"in {department}, starting {joining_date or 'soon'}. Your manager, "
            f"{manager or 'your manager'}, along with HR, IT, and Security, will be reaching "
            f"out shortly with next steps to get you set up.\n\nWelcome to the team,\nHR"
        ),
    }


def draft_welcome_email(name: str, role: str, department: str, joining_date: str, manager: str) -> dict:
    try:
        result = call_ollama_json(PROMPT_TEMPLATE.format(
            name=name, role=role or "your new role", department=department,
            joining_date=joining_date or "soon", manager=manager or "your manager",
        ))
        if "subject" not in result or "body" not in result:
            raise OllamaError("missing expected keys in model output")
        return result
    except OllamaError:
        return _fallback_template(name, role, department, joining_date, manager)
