import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Employee
from app.schemas.employee import EmployeeCreate, EmployeeOut
from app.services.progress import get_onboarding_completion_pct
from app.services.experience import derive_experience_level

router = APIRouter(prefix="/employees", tags=["employees"])


def _to_employee_kwargs(payload: EmployeeCreate) -> dict:
    """documents_files arrives as a Python list on the schema but is
    stored as a JSON-encoded string column on the model -- convert here
    so both create and update stay consistent. It's raw evidence to sync
    and validate, not a completion claim (see hrms_document_sync).
    years_of_experience is ephemeral (not a DB column) -- used only to
    derive experience_level if HRMS/manual entry didn't set it explicitly."""
    data = payload.model_dump()
    docs = data.pop("documents_files", None)
    data["documents_files"] = json.dumps(docs) if docs is not None else None
    years_exp = data.pop("years_of_experience", None)
    data["experience_level"] = derive_experience_level(
        title=data.get("title"), years_of_experience=years_exp, explicit=data.get("experience_level")
    )
    return data


@router.get("")
def list_employees(db: Session = Depends(get_db)):
    """
    Note: no response_model here (unlike the other routes below) because
    we're adding completion_pct on top of EmployeeOut's fields -- a
    response_model would silently strip it back out.
    """
    employees = db.query(Employee).all()
    return [
        {**EmployeeOut.model_validate(e).model_dump(), "completion_pct": get_onboarding_completion_pct(db, e.id)}
        for e in employees
    ]


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(employee_id: str, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee


@router.post("", response_model=EmployeeOut)
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db)):
    existing = db.query(Employee).filter(Employee.employee_id == payload.employee_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Employee ID already exists")
    employee = Employee(**_to_employee_kwargs(payload))
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@router.put("/{employee_id}", response_model=EmployeeOut)
def update_employee(employee_id: str, payload: EmployeeCreate, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    for key, value in _to_employee_kwargs(payload).items():
        setattr(employee, key, value)
    db.commit()
    db.refresh(employee)
    return employee
