"""
Checks whether a submitted document plausibly matches its claimed type
AND the HRMS data on file for that employee. This is a PLAUSIBILITY
check (real file, right format/fields, matches the employee's actual
HRMS record) -- not forgery or tamper detection, which isn't
realistically buildable here and would oversell what this agent
actually does.

Which HRMS fields matter for which document type is config-driven (see
document_identity_fields.json) -- e.g. a Government ID Proof should
have the employee's SSN in it, not just their name; an Address Proof
should have their on-file location. identity_fields is a dict of
{field_label: value} built by the caller from that config.

Same pattern as every other agent in this app: Ollama does the real
classification, with a rule-based fallback so a slow/down Ollama never
blocks the pipeline (see architecture doc section 6).
"""
from app.ai_client import call_ollama_json, OllamaError
from app.config import get_document_keywords

PROMPT_TEMPLATE = """You are checking whether a submitted document plausibly
matches its claimed type AND the employee's data on file, for an HR
onboarding process. This is a plausibility check only -- not forgery or
authenticity/tamper detection.

Claimed document type: {document_name}
Employee data on file (from HRMS) to cross-check against the document content:
{identity_fields_list}
Extracted document text (may be from OCR, may contain noise):
---
{extracted_text}
---

For EACH field listed above, check whether it plausibly appears in the
document content (allow for minor formatting differences, e.g. SSNs
with or without dashes). Respond ONLY with JSON in this exact shape:
{{"type_match": true or false,
  "field_matches": {{"<field name>": true or false, ...}},
  "confidence": "high" or "medium" or "low",
  "issues": ["short phrase", "short phrase"],
  "reasoning": "one or two sentences explaining the verdict"}}
"""

_REQUIRED_KEYS = {"type_match", "field_matches", "confidence", "issues", "reasoning"}


def _fuzzy_contains(value: str, text_lower: str) -> bool:
    """Loose containment check -- strips non-alphanumerics so e.g. an
    SSN with/without dashes, or a name with extra whitespace, still
    matches."""
    if not value:
        return False
    cleaned = "".join(ch for ch in str(value).lower() if ch.isalnum())
    text_cleaned = "".join(ch for ch in text_lower if ch.isalnum())
    return cleaned in text_cleaned if cleaned else False


def _fallback_validate(document_name: str, identity_fields: dict, extracted_text: str) -> dict:
    text_lower = (extracted_text or "").lower()

    if not text_lower.strip():
        return {
            "type_match": False,
            "field_matches": {field: False for field in identity_fields},
            "confidence": "low",
            "issues": ["no readable text extracted from the file"],
            "reasoning": "The file could not be read as text (blank, corrupt, or an unreadable scan).",
        }

    keywords_by_doc = get_document_keywords()
    keywords = keywords_by_doc.get(document_name, [])
    # Reuse the same normalized (punctuation/whitespace-insensitive) check
    # used for field values -- a scan reading "SOCIAL SECURITY" (with a
    # space) should still match a "socialsecurity" keyword, the same way
    # an SSN with/without dashes matches a field value.
    type_match = any(_fuzzy_contains(kw, text_lower) for kw in keywords)

    field_matches = {}
    issues = []
    for field_name, value in identity_fields.items():
        matched = _fuzzy_contains(value, text_lower)
        field_matches[field_name] = matched
        if not matched:
            issues.append(f"{field_name} ('{value}') not found in document content")

    if not type_match:
        issues.append(f"content doesn't clearly indicate '{document_name}'")

    passed = type_match and all(field_matches.values())
    return {
        "type_match": type_match,
        "field_matches": field_matches,
        "confidence": "medium" if passed else "low",
        "issues": issues,
        "reasoning": (
            "Rule-based check: keyword and all cross-checked HRMS fields found in extracted content."
            if passed else
            "Rule-based check: content did not clearly match the claimed document type and/or all HRMS fields on file."
        ),
    }


def validate_document(document_name: str, identity_fields: dict, extracted_text: str) -> dict:
    """identity_fields: dict of {field_label: value}, e.g.
    {"name": "Rachel Bennett", "ssn_number": "556-21-9043"} for a
    Government ID Proof -- built by the caller from
    document_identity_fields.json + the employee's HRMS-sourced data.
    Every field present must match for the document to pass -- this is
    what makes this a validation of "HRMS's data against the document",
    not just an identity-by-name check."""
    identity_fields = {k: v for k, v in identity_fields.items() if v}  # skip fields HRMS never provided

    try:
        result = call_ollama_json(
            PROMPT_TEMPLATE.format(
                document_name=document_name,
                identity_fields_list="\n".join(f"- {k}: {v}" for k, v in identity_fields.items()) or "(none on file)",
                extracted_text=(extracted_text or "")[:6000],  # keep prompt bounded
            )
        )
        if not _REQUIRED_KEYS.issubset(result.keys()):
            raise OllamaError("missing expected keys in model output")
        return result
    except OllamaError:
        return _fallback_validate(document_name, identity_fields, extracted_text)
