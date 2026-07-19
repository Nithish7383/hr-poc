"""
Pulls records from the mock HRMS service and maps them onto the internal
Employee schema. This is the module that gets swapped when a real HRMS
(Workday/ADP/BambooHR) is connected post-POC -- only the base URL and
field mapping change, nothing downstream.
"""
import os
import json
import requests
from sqlalchemy.orm import Session
from app.models import Employee
from app.schemas.employee import EmployeeCreate
from app.services.experience import derive_experience_level

HRMS_URL = os.getenv("MOCK_HRMS_URL", "http://localhost:9000")


def _map_new_hire(record: dict) -> EmployeeCreate:
    """Maps mock-HRMS field names onto our Employee schema.
    Swap this mapping when pointing at a real HRMS export.

    role: HRMS sends this directly now (the role the candidate applied
    for/was hired as) -- AI role classification only runs as a fallback
    if this is missing or invalid, see onboarding_orchestrator._resolve_role.

    experience_level: from HRMS directly if provided, else derived from
    years_of_experience if HRMS sends that instead."""
    return EmployeeCreate(
        name=record["full_name"],
        employee_id=record["hrms_employee_id"],
        email=record["work_email"],
        department=record["department"],
        title=record.get("job_title"),
        ssn_number=record.get("ssn_number"),
        role=record.get("role"),
        experience_level=record.get("experience_level"),
        years_of_experience=record.get("years_of_experience"),
        office=record.get("location"),
        manager=record.get("manager_name"),
        joining_date=record.get("start_date"),
        sync_source="hrms",
        documents_files=record.get("documents_files", []),
    )


def pull_new_hires(db: Session) -> list[Employee]:
    resp = requests.get(f"{HRMS_URL}/hrms/employees/new", timeout=5)
    resp.raise_for_status()
    records = resp.json()

    created = []
    for record in records:
        mapped = _map_new_hire(record)
        exists = db.query(Employee).filter(Employee.employee_id == mapped.employee_id).first()
        if exists:
            continue
        employee_kwargs = mapped.model_dump()
        docs = employee_kwargs.pop("documents_files", None)
        employee_kwargs["documents_files"] = json.dumps(docs) if docs is not None else None
        years_exp = employee_kwargs.pop("years_of_experience", None)
        employee_kwargs["experience_level"] = derive_experience_level(
            title=employee_kwargs.get("title"), years_of_experience=years_exp,
            explicit=employee_kwargs.get("experience_level"),
        )
        employee = Employee(**employee_kwargs)
        db.add(employee)
        db.commit()
        db.refresh(employee)
        created.append(employee)
        # ack back to mock HRMS so re-running the demo doesn't reprocess
        try:
            requests.post(f"{HRMS_URL}/hrms/employees/{record['hrms_employee_id']}/ack", timeout=5)
        except requests.RequestException:
            pass
    return created


def pull_exits(db: Session) -> list[dict]:
    resp = requests.get(f"{HRMS_URL}/hrms/employees/exiting", timeout=5)
    resp.raise_for_status()
    records = resp.json()

    results = []
    for record in records:
        employee = db.query(Employee).filter(Employee.employee_id == record["hrms_employee_id"]).first()
        if not employee:
            continue  # can't offboard someone we never onboarded
        results.append({
            "employee_id": employee.id,
            "last_working_day": record.get("exit_date"),
            "exit_reason": record.get("exit_reason", "Not specified"),
        })
        try:
            requests.post(f"{HRMS_URL}/hrms/employees/{record['hrms_employee_id']}/ack", timeout=5)
        except requests.RequestException:
            pass
    return results
