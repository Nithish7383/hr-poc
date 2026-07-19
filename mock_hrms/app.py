"""
Mock HRMS -- simulates a real HRMS's employee-feed API surface.
Backed by JSON fixture files, not a real database, by design: this
service exists purely to prove out the connector/orchestrator pattern
without needing real Workday/ADP/BambooHR credentials.

When a real HRMS is connected post-POC, this whole service is deleted
and hrms_connector.py in the backend points at the real API instead --
the mapping logic and field names are the only things that change.
"""
import json
import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

app = FastAPI(title="Mock HRMS")

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
NEW_HIRES_FILE = os.path.join(FIXTURES_DIR, "new_hires.json")
EXITS_FILE = os.path.join(FIXTURES_DIR, "exits.json")
MOCK_EMPLOYEE_DOCS_DIR = os.path.join(os.path.dirname(__file__), "mock_employee_docs")


def _load(path):
    with open(path) as f:
        return json.load(f)


def _save(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


@app.get("/hrms/employees/new")
def get_new_hires():
    records = _load(NEW_HIRES_FILE)
    return [r for r in records if not r.get("synced")]


@app.get("/hrms/employees/exiting")
def get_exiting():
    records = _load(EXITS_FILE)
    return [r for r in records if not r.get("synced")]


@app.post("/hrms/employees/{hrms_employee_id}/ack")
def ack_employee(hrms_employee_id: str):
    for path in (NEW_HIRES_FILE, EXITS_FILE):
        records = _load(path)
        found = False
        for r in records:
            if r["hrms_employee_id"] == hrms_employee_id:
                r["synced"] = True
                found = True
        if found:
            _save(path, records)
            return {"acked": hrms_employee_id}
    raise HTTPException(status_code=404, detail="Employee not found in mock HRMS")


@app.post("/hrms/_reset")
def reset_fixtures():
    """Dev convenience: unmark everyone as synced so the demo can be rerun."""
    for path in (NEW_HIRES_FILE, EXITS_FILE):
        records = _load(path)
        for r in records:
            r["synced"] = False
        _save(path, records)
    return {"reset": True}


@app.get("/hrms/employees/{hrms_employee_id}/documents/{filename}")
def get_employee_document(hrms_employee_id: str, filename: str):
    """Serves a single document file for an employee, simulating a real
    HRMS's document-store API. Deliberately tolerant: a missing file
    404s cleanly rather than crashing the service -- backend sync code
    treats a 404 the same way it would treat a real HRMS's occasional
    missing file, not as a fatal error."""
    path = os.path.join(MOCK_EMPLOYEE_DOCS_DIR, hrms_employee_id, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(path)


@app.get("/")
def health():
    return {"status": "mock HRMS running"}
