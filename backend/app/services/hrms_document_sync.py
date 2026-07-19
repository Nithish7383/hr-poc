"""
Pulls the real files HRMS says exist for an employee (documents_files)
into local storage, matches each to a required document type, and hands
matched files off to the same validation pipeline email attachments go
through. This is what actually closes the gap where documents_submitted
was trusted as a claim with nothing behind it -- files are fetched and
validated regardless of what documents_submitted said.

Swap-out note (mirrors hrms_connector.py): when a real HRMS replaces
the mock, only the fetch call in _download_file needs to change.
"""
import json
import os

import requests

from app.config import get_document_keywords, get_required_documents
from app.models import Employee, EmployeeDocument
from app.services.document_name_matching import best_matching_required_doc

HRMS_URL = os.getenv("MOCK_HRMS_URL", "http://localhost:9000")


class HrmsSyncError(Exception):
    pass


def _parse_hrms_path(relative_path: str) -> tuple[str, str]:
    """'../mock_employee_docs/EMP-1002/Rachel_Bennett_BankDetails.pdf'
    -> ('EMP-1002', 'Rachel_Bennett_BankDetails.pdf')"""
    parts = [p for p in relative_path.replace("\\", "/").split("/") if p not in ("", "..")]
    if len(parts) < 2:
        raise HrmsSyncError(f"Unrecognized HRMS document path shape: {relative_path}")
    return parts[-2], parts[-1]


def _download_file(hrms_employee_id: str, filename: str, dest_path: str) -> bool:
    """Fetches one file from mock_hrms. Returns False (never raises) on
    any failure -- a single missing/broken file should never take down
    sync for the rest of an employee's documents."""
    try:
        resp = requests.get(
            f"{HRMS_URL}/hrms/employees/{hrms_employee_id}/documents/{filename}", timeout=10
        )
        if resp.status_code != 200:
            return False
        with open(dest_path, "wb") as f:
            f.write(resp.content)
        return True
    except requests.RequestException:
        return False


def _match_filename_to_required_doc(filename: str, required_docs: list[str]) -> str | None:
    """Same keyword-heuristic style already used for email attachments,
    applied to HRMS filenames -- a document type is matched if any of
    its keywords appear in the filename."""
    keywords_by_doc = get_document_keywords()
    filename_lower = filename.lower()
    for doc_name in required_docs:
        keywords = keywords_by_doc.get(doc_name, [])
        if any(kw in filename_lower for kw in keywords):
            return doc_name
    return None


def sync_employee_documents(db, employee: Employee) -> dict:
    """Fetches and matches every file in employee.documents_files.
    Returns {"matched": {doc_name: local_file_path}, "unmatched_files": [...]}.
    Creates no EmployeeDocument rows itself -- that's the caller's job
    (onboarding_orchestrator), since row creation needs to distinguish
    "matched", "claimed but unbacked", and "not claimed, just missing"."""
    if not employee.documents_files:
        return {"matched": {}, "unmatched_files": []}

    try:
        file_paths = json.loads(employee.documents_files)
    except (json.JSONDecodeError, TypeError):
        return {"matched": {}, "unmatched_files": []}

    required_docs = get_required_documents()
    upload_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", employee.id
    )
    os.makedirs(upload_dir, exist_ok=True)

    matched = {}
    unmatched_files = []

    for relative_path in file_paths:
        try:
            hrms_employee_id, filename = _parse_hrms_path(relative_path)
        except HrmsSyncError:
            continue

        dest_path = os.path.join(upload_dir, filename)
        if not _download_file(hrms_employee_id, filename, dest_path):
            continue  # couldn't fetch -- treated as if the file doesn't exist

        doc_name = _match_filename_to_required_doc(filename, required_docs)
        if doc_name and doc_name not in matched:
            matched[doc_name] = dest_path
        elif not doc_name:
            unmatched_files.append(filename)

    return {"matched": matched, "unmatched_files": unmatched_files}
