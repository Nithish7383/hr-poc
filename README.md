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
- `tesseract-ocr` and `poppler-utils` (OS packages, not pip) -- needed for
  document validation to read scanned PDFs/images. `apt-get install
  tesseract-ocr poppler-utils` on Debian/Ubuntu.

## Quick start

```bash
# Terminal 1 -- mock HRMS
cd mock_hrms
pip install -r requirements.txt --break-system-packages
uvicorn app:app --reload --port 9000

# Terminal 2 -- backend
cd backend
pip install -r requirements.txt --break-system-packages
cp ../.env.example .env   # then edit DATABASE_URL to point at your Postgres,
                          # and fill in SMTP/IMAP/team-email vars for real email send/receive
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
Registration (HRMS sync or manual)
  -> AI drafts and queues a real Welcome Email (HR reviews/edits/approves -> real send)
  -> Validation:
       - HRMS-sourced employees: real document files are synced in from HRMS,
         matched to required document types, and validated (see below)
       - Anything still missing (no file synced, or came in via email) goes
         through the existing draft -> HR-approve -> real SMTP send -> IMAP
         reply-monitoring -> attachment-matching loop, self-sustaining until complete
       - EVERY document (either source) gets its own "document_validation" HR
         task -- approve/reject per document, same per-task model as everywhere else
  -> Role Resolution (HRMS role used directly; AI classifier is FALLBACK ONLY)
  -> fans out into 4 PARALLEL TRACKS: HR / IT / Security / Manager
       - each task: AI suggests (with reasoning) -> human can edit -> approves/rejects
       - editable tasks: Assign Applications, Asset Allocation, Assign Security
         Groups (checklists), Project Recommendation (dropdown)
       - compliance items are individual HR tasks, tagged category="compliance"
  -> employee goes Active once every track's mandatory tasks are approved
       -> AI drafts and queues a real onboarding Feedback Request email;
          reply is monitored, summarized + sentiment-scored by AI
```

Offboarding mirrors this exactly (Exit Request -> Access Discovery -> Risk
Assessment -> same 4 tracks -> Exited), using a **separate** `OffboardingTask`
table rather than sharing onboarding's table. No document/email flow --
that's onboarding-specific.

Approval is **per-task**, not per-track, and **independent of task
completion status** -- an approver can approve/reject regardless of whether
other tasks in the same track are done. The old per-track `Approval` table
is fully retired for both workflows; task status itself (`pending` /
`approved` / `rejected`) *is* the approval record now.

Track and employee completion are always **computed live** from task state
(`services/track_status.py`), never stored/cached -- this was a deliberate
fix after an earlier bug where a cached completion percentage drifted out
of sync with reality.

Pending approval tasks that sit for over `ESCALATION_HOURS` (default 72)
trigger a one-shot escalation email to that track's team inbox. Missing-
document requests that go unanswered for `REMINDER_HOURS` (default 48) get
one automatic reminder resend.

### Document validation

A document is only ever considered "received" once a real file has been
checked and a human has approved the specific per-document task -- never
from a claim alone (`documents_submitted` from HRMS is not read for gating
purposes at all anymore).

- **HRMS sync**: real files (`documents_files` in the HRMS record) are
  pulled over HTTP from `mock_hrms` into local storage, matched to required
  document types by filename keyword (`config_data/documents_keywords.json`).
- **Content extraction**: `pdfplumber` for text-layer PDFs, falling back to
  OCR (`pdf2image` + `pytesseract`) per-page for scanned/image-only PDFs,
  plus standalone image OCR.
- **Validation**: AI (Ollama) checks the extracted content against the
  claimed document type AND every HRMS-provided field relevant to that type
  (`config_data/document_identity_fields.json` -- e.g. Government ID Proof
  checks name **and** SSN, not just name), with a rule-based fallback
  (keyword + fuzzy field matching) if Ollama is down.
- **Per-document task**: every matched document (any source) gets its own
  "Validate Document: X" HR task showing confidence + reasoning + a "View
  Document" link, regardless of verdict -- a passed check still needs a
  human click. Rejecting one re-queues the missing-document email loop with
  the rejection reason included.

## Screens

| Screen | Route | Notes |
|---|---|---|
| Login | `/login` | JWT, not enforced on backend routes (deliberate POC scope) |
| Executive Dashboard | `/dashboard` | 6 widgets, 4 charts, recent activity |
| Employee Directory | `/directory` | search/filter, experience-level badge |
| Employee Profile | `/profile/[id]` | onboarding + offboarding tasks, compliance, timeline |
| Onboarding Tracker | `/onboarding-tracker` | read-only, live-polling, per-track expand, per-document source/confidence |
| Offboarding Tracker | `/offboarding-tracker` | same pattern, mirrors onboarding |
| Approval Dashboard | `/approvals` | role-segregated, editable AI suggestions, per-task decisions |
| AI Decision Center | `/ai-decisions` | consolidated reasoning + role classification confidence |
| Compliance Dashboard | `/compliance` | aggregate compliance across both workflows, HR-owned |
| AI Insights Dashboard | `/ai-insights` | rule-based computed insights, not AI-generated numbers |
| Reports Dashboard | `/reports` | generate + download PDF summaries |
| HR Assistant | `/ai-assistant` | RAG chatbot over HR policy docs (FAISS-backed, `services/chatbot/`) |

## Backend structure

```
backend/app/
  routers/         one file per domain (see main.py for the full list) --
                     approvals.py serves the role-scoped Approval Dashboard
                     queue and onboarding.py serves per-employee task/document
                     detail; these are TWO INDEPENDENT serializers over the
                     same underlying tasks, keep both in sync when adding fields
  orchestrators/    onboarding_orchestrator.py, offboarding_orchestrator.py
  agents/           role_classifier, access_recommender, hardware_recommender,
                     compliance_recommender, risk_assessor, document_email_agent,
                     document_validator_agent, project_recommender_agent,
                     privileged_access_agent, team_intro_agent, team_farewell_agent,
                     welcome_email_agent, feedback_survey_agent
                     (buddy_recommender_agent.py is vestigial, unused, kept)
  services/         track_status.py (shared, parameterized for both workflows),
                     progress.py, experience.py, document_extraction.py,
                     document_name_matching.py, hrms_document_sync.py,
                     license_manager.py, reminders.py, chatbot/ (RAG pipeline)
  models/           see employee.py; ComplianceTask and the old Approval table
                     are retired/vestigial, kept but unused
  config_data/       roles, applications, security_groups, asset_templates,
                      compliance_templates, required_documents, risk_factors,
                      projects.json, documents_keywords.json,
                      document_identity_fields.json
integrations/hrms_connector.py   maps mock HRMS fields -> Employee schema
                                  (including ssn_number, documents_files)
mock_hrms/                       simulated HRMS, 10 employees covering edge
                                  cases (missing role, invalid role, experience
                                  priority, varying document completeness);
                                  serves real files via
                                  GET /hrms/employees/{id}/documents/{filename}
```

## Known gaps / deliberate decisions

| Item | Status |
|---|---|
| Ollama model currently set to a cloud tag | Known, intentionally left as-is for now -- swap to a local model (`qwen2.5:7b-instruct` or similar) before any live demo |
| Auth not enforced on backend routes | Deliberate POC scope call |
| Document validation is a plausibility check, not forgery/tamper detection | By design -- checks content matches claimed type + HRMS data, not authenticity in a legal sense |
| `ssn_number` stored in plaintext on `employees` | Matches this POC's existing security posture; flag if unacceptable even for a demo dataset |
| Mentor recommendation agent | Explicitly future scope |
| Manager approves the shown Project Recommendation rather than picking from a live search | Simplification -- dropdown covers the full catalog, but no search/filter UI |

## Testing

Every AI agent has a rule-based fallback -- if Ollama is down or slow, the
pipeline still completes with deterministic (if less nuanced) output rather
than failing.

For a full clean-database test (schema has grown -- update this list if you add tables):
```bash
docker exec -it poc-repo-postgres-1 psql -U poc -d onboarding_poc -c "DROP TABLE IF EXISTS employees, onboarding_tracker, offboarding_tracker, role_classifications, access_recommendations, asset_allocations, compliance_tasks, exit_requests, risk_assessments, approvals, reports, audit_log, employee_documents, document_request_emails, welcome_emails, feedback_emails, feedback_responses, onboarding_tasks, offboarding_tasks, policy_documents, policy_chunks, conversations, messages, received_attachments, software_licenses CASCADE;"
```
Restart the backend (recreates tables clean), reset the mock HRMS
(`POST /hrms/_reset`), then sync (`POST /hrms/sync/new-hires`) and walk
through Approval Dashboard -> Tracker -> Profile -> Dashboard -> Insights ->
Compliance -> Reports for at least one full employee, onboarding through
offboarding.

For document validation specifically: after a fresh sync, expect each
employee's `documents_files`-backed documents to show `under_review (synced
from HRMS)` in the Tracker, with any remaining required documents (no
backing file in this fixture set) falling into the normal missing-document
email flow. See each document's task reasoning in the Approval Dashboard for
the AI's (or fallback's) confidence and which HRMS fields were checked.
