"""
Two jobs: (1) draft the onboarding-feedback request email sent once an
employee reaches 'active' status, and (2) summarize whatever they reply
with. Both go through Ollama with a rule-based fallback, same as every
other agent in this project -- the pipeline never hard-fails on AI
unavailability.
"""
from app.ai_client import call_ollama_json, OllamaError

REQUEST_PROMPT_TEMPLATE = """Write a short, friendly email to {name} asking
for their feedback now that their onboarding is complete. Ask 2-3 open
questions covering: how the onboarding process felt overall, whether IT/
access setup went smoothly, and anything that could be improved. Ask them
to just reply to this email. Keep it under 100 words. Respond ONLY with
JSON in this exact shape:
{{"subject": "<email subject line>", "body": "<email body text>"}}
"""

SUMMARY_PROMPT_TEMPLATE = """Summarize this onboarding feedback reply in
2-3 sentences, and classify its overall sentiment. Feedback text:
---
{raw_text}
---
Respond ONLY with JSON in this exact shape:
{{"summary": "<2-3 sentence summary>", "sentiment": "positive|neutral|negative"}}
"""


def _fallback_request_template(name: str) -> dict:
    return {
        "subject": "How was your onboarding?",
        "body": (
            f"Hi {name},\n\nNow that you're settled in, we'd love to hear how onboarding went. "
            f"How did the overall process feel? Did IT/access setup go smoothly? Anything we "
            f"should improve for the next person?\n\nJust reply to this email with your thoughts.\n\n"
            f"Thanks,\nHR Team"
        ),
    }


def draft_feedback_request_email(name: str) -> dict:
    try:
        result = call_ollama_json(REQUEST_PROMPT_TEMPLATE.format(name=name))
        if "subject" not in result or "body" not in result:
            raise OllamaError("missing expected keys in model output")
        return result
    except OllamaError:
        return _fallback_request_template(name)


def _fallback_summary(raw_text: str) -> dict:
    # No sentiment model available -- neutral is the honest default rather
    # than guessing from keywords, which would be misleading in a fallback.
    snippet = raw_text.strip().replace("\n", " ")
    if len(snippet) > 200:
        snippet = snippet[:200].rsplit(" ", 1)[0] + "..."
    return {"summary": snippet or "(empty reply)", "sentiment": "neutral"}


def summarize_feedback_response(raw_text: str) -> dict:
    try:
        result = call_ollama_json(SUMMARY_PROMPT_TEMPLATE.format(raw_text=raw_text))
        if "summary" not in result or "sentiment" not in result:
            raise OllamaError("missing expected keys in model output")
        return result
    except OllamaError:
        return _fallback_summary(raw_text)
