from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Employee
from app.schemas.employee import EmployeeCreate, EmployeeOut
from app.services.progress import get_onboarding_completion_pct

router = APIRouter(prefix="/employees", tags=["employees"])


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
    employee = Employee(**payload.model_dump())
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@router.put("/{employee_id}", response_model=EmployeeOut)
def update_employee(employee_id: str, payload: EmployeeCreate, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    for key, value in payload.model_dump().items():
        setattr(employee, key, value)
    db.commit()
    db.refresh(employee)
    return employee
