from pydantic import BaseModel
from typing import Optional


class EmployeeCreate(BaseModel):
    name: str
    employee_id: str
    email: str
    department: str
    title: Optional[str] = None
    ssn_number: Optional[str] = None  # from HRMS, used only for document identity cross-checks -- not exposed via EmployeeOut
    role: Optional[str] = None  # from HRMS directly if provided; AI classifier is fallback-only
    experience_level: Optional[str] = None  # "fresher" | "experienced" -- from HRMS if provided, else derived
    office: Optional[str] = None
    manager: Optional[str] = None
    joining_date: Optional[str] = None
    sync_source: Optional[str] = "manual"
    documents_files: Optional[list[str]] = None  # HRMS-side file paths to sync in and validate -- NOT a completion claim, just raw evidence to fetch
    years_of_experience: Optional[int] = None  # not stored -- only used to derive experience_level if not explicitly set


class EmployeeOut(BaseModel):
    id: str
    name: str
    employee_id: str
    email: str
    department: str
    title: Optional[str]
    role: Optional[str]
    experience_level: Optional[str]
    office: Optional[str]
    manager: Optional[str]
    joining_date: Optional[str]
    sync_source: str
    status: str

    class Config:
        from_attributes = True


class ExitRequestCreate(BaseModel):
    """employee_id is deliberately NOT here -- the route it's used on
    (POST /offboarding/{employee_id}/start) already has it in the URL
    path. Requiring it twice was a redundant, easy-to-miss bug."""
    last_working_day: Optional[str] = None
    exit_reason: Optional[str] = None
    sync_source: Optional[str] = "manual"


class ApprovalDecision(BaseModel):
    status: str  # "approved" | "rejected"


class TaskDecision(BaseModel):
    status: str  # "approved" | "rejected" -- decision on a single OnboardingTask


class TaskSelectionUpdate(BaseModel):
    selected_options: list[str]  # the approver's edited choice, for multi_select/single_select tasks only

class EmailDraftUpdate(BaseModel):
    subject: str
    body: str