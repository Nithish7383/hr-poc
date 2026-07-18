# Onboarding / Offboarding POC

AI-assisted employee lifecycle management. Real Ollama-backed agents suggest,
humans decide (and can edit those suggestions) via a role-based Approval
Dashboard. Both onboarding and offboarding run through the same architecture:
parallel HR/IT/Security/Manager task tracks, computed live from task state,
never cached.

## Prerequisites

- Python 3.11+, Node 20+
- [Ollama](https://ollama.com) running locally
- Docker + docker-compose (for Postgres)

## Quick start

```bash
# Terminal 1 -- mock HRMS
cd mock_hrms
pip install -r requirements.txt --break-system-packages
uvicorn app:app --reload --port 9000

# Terminal 2 -- backend
cd backend
pip install -r requirements.txt --break-system-packages
cp ../.env.example .env   # then edit DATABASE_URL to point at your Postgres
uvicorn main:app --reload --port 8000

# Terminal 3 -- frontend
cd frontend
npm install
npm run dev

# Terminal 4 -- Ollama
ollama serve
```

Postgres via `docker-compose up -d postgres` (check your `.env`'s host port matches -- if you hit a port conflict with a native Postgres install, see the note in `.env.example`).

Visit `http://localhost:3000/login`. Demo users: `hr@example.com` / `manager@example.com` / `it@example.com` / `security@example.com`, password `demo123` for all.

## Architecture

```
Registration (HRMS or manual)
  -> Validation (pauses if required documents missing -- HR reviews & marks received)
  -> Role Resolution (HRMS role used directly; AI classifier is FALLBACK ONLY)
  -> fans out into 4 PARALLEL TRACKS: HR / IT / Security / Manager
       - each task: AI suggests (with reasoning) -> human can edit -> approves/rejects
       - editable tasks: Assign Applications, Asset Allocation, Assign Security
         Groups (checklists), Project Recommendation (dropdown)
       - compliance items are individual HR tasks, tagged category="compliance"
  -> employee goes Active once every track's mandatory tasks are approved
```

Offboarding mirrors this exactly (Exit Request -> Access Discovery -> Risk
Assessment -> same 4 tracks -> Exited), using a **separate** `OffboardingTask`
table rather than sharing onboarding's table.

Approval is **per-task**, not per-track, and **independent of task
completion status** -- an approver can approve/reject regardless of whether
other tasks in the same track are done. The old per-track `Approval` table
is fully retired for both workflows; task status itself (`pending` /
`approved` / `rejected`) *is* the approval record now.

Track and employee completion are always **computed live** from task state
(`services/track_status.py`), never stored/cached -- this was a deliberate
fix after an earlier bug where a cached completion percentage drifted out
of sync with reality.

## Screens

| Screen | Route | Notes |
|---|---|---|
| Login | `/login` | JWT, not enforced on backend routes (deliberate POC scope) |
| Executive Dashboard | `/dashboard` | 6 widgets, 4 charts, recent activity |
| Employee Directory | `/directory` | search/filter, experience-level badge |
| Employee Profile | `/profile/[id]` | onboarding + offboarding tasks, compliance, timeline |
| Onboarding Tracker | `/onboarding-tracker` | read-only, live-polling, per-track expand |
| Offboarding Tracker | `/offboarding-tracker` | same pattern, mirrors onboarding |
| Approval Dashboard | `/approvals` | role-segregated, editable AI suggestions, per-task decisions |
| AI Decision Center | `/ai-decisions` | consolidated reasoning + role classification confidence |
| Compliance Dashboard | `/compliance` | aggregate compliance across both workflows, HR-owned |
| AI Insights Dashboard | `/ai-insights` | rule-based computed insights, not AI-generated numbers |
| Reports Dashboard | `/reports` | generate + download PDF summaries |

## Backend structure

```
backend/app/
  routers/         one file per domain (see main.py for the full list)
  orchestrators/    onboarding_orchestrator.py, offboarding_orchestrator.py
  agents/           role_classifier, access_recommender, hardware_recommender,
                     compliance_recommender, risk_assessor, document_email_agent,
                     project_recommender_agent, privileged_access_agent,
                     team_intro_agent, team_farewell_agent
  services/         track_status.py (shared, parameterized for both workflows),
                     progress.py, experience.py
  models/           14 tables -- see employee.py; ComplianceTask and the old
                     Approval table are retired/vestigial, kept but unused
  config_data/       roles, applications, security_groups, asset_templates,
                      compliance_templates, required_documents, risk_factors,
                      projects.json
integrations/hrms_connector.py   maps mock HRMS fields -> Employee schema
mock_hrms/                       simulated HRMS, 6 employees covering edge
                                  cases (missing role, invalid role, experience
                                  priority, varying document completeness)
```

## Known gaps / deliberate decisions

| Item | Status |
|---|---|
| Ollama model currently set to a cloud tag | Known, intentionally left as-is for now -- swap to a local model (`qwen2.5:7b-instruct` or similar) before any live demo |
| Auth not enforced on backend routes | Deliberate POC scope call |
| Real PDF document upload/content validation | Parked -- current tracking is presence/absence only |
| Mentor recommendation agent | Explicitly future scope |
| Manager approves the shown Project Recommendation rather than picking from a live search | Simplification -- dropdown covers the full catalog, but no search/filter UI |

## Testing

Every AI agent has a rule-based fallback -- if Ollama is down or slow, the
pipeline still completes with deterministic (if less nuanced) output rather
than failing.

For a full clean-database test:
```bash
docker exec -it poc-repo-postgres-1 psql -U poc -d onboarding_poc -c "DROP TABLE IF EXISTS employees, onboarding_tracker, offboarding_tracker, role_classifications, access_recommendations, asset_allocations, compliance_tasks, exit_requests, risk_assessments, approvals, reports, audit_log, employee_documents, onboarding_tasks, offboarding_tasks, document_request_emails, received_attachments, software_licenses CASCADE;"
```
Restart the backend (recreates tables clean), reset the mock HRMS
(`POST /hrms/_reset`), then sync (`POST /hrms/sync/new-hires`) and walk
through Approval Dashboard -> Tracker -> Profile -> Dashboard -> Insights ->
Compliance -> Reports for at least one full employee, onboarding through
offboarding.
