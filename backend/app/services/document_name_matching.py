"""
Single canonical place for comparing document-type name strings.
Fixture/HRMS data has been observed using inconsistent spellings for the
same conceptual document ("Bank Details" / "BankDetails" / canonical
"Bank Account Details") -- this module normalizes before comparing so
that inconsistency doesn't silently break matching.

NOTE: this is used for display/audit reconciliation and for matching
synced filenames to required document types. It is NOT used to decide
whether a document requirement is satisfied -- that's decided by real
validated evidence (EmployeeDocument.status == "received"), never by a
name appearing in some claimed list. See hrms_document_sync.py.
"""
import re


def normalize(name: str) -> str:
    """Lowercase, strip, drop everything but letters/digits -- so
    'Bank Details', 'BankDetails', and 'Bank  Account Details' all
    reduce to a comparable token."""
    if not name:
        return ""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def best_matching_required_doc(candidate_name: str, required_docs: list[str]) -> str | None:
    """Returns the required-document name that candidate_name most
    plausibly refers to, or None if nothing plausible matches.
    Tries normalized exact match first, then normalized substring
    overlap (in either direction) as a looser fallback."""
    if not candidate_name:
        return None

    normalized_candidate = normalize(candidate_name)
    normalized_map = {normalize(doc): doc for doc in required_docs}

    if normalized_candidate in normalized_map:
        return normalized_map[normalized_candidate]

    for norm_doc, original_doc in normalized_map.items():
        if norm_doc in normalized_candidate or normalized_candidate in norm_doc:
            return original_doc

    return None
