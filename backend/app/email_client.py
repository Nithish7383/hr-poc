"""
Real SMTP send + IMAP reply-checking. This is genuinely new infrastructure
for this POC -- everything else "email"-shaped so far has been simulated
(drafted, logged, never sent). This one actually sends and actually
reads a real inbox.

Credentials come from env vars only -- never hardcoded, never logged.
Uses Gmail's SMTP/IMAP endpoints by default; override via env vars if
using a different provider.

SECURITY NOTES (read before wiring this to a real inbox):
- Requires a Gmail App Password (16-char code), NOT your real account
  password -- regular passwords are rejected by Gmail's SMTP/IMAP since
  ~2022. Generate one at https://myaccount.google.com/apppasswords
  (requires 2-Step Verification to be enabled first).
- Attachments from replies are UNTRUSTED INPUT. This module extracts
  them but does not save them to disk itself -- the caller
  (routers/onboarding.py) is responsible for filename sanitization and
  content-type validation before writing anything to the filesystem.
- No malware/virus scanning is performed. Acceptable for a POC on a
  controlled demo inbox; not acceptable for a real production inbox
  receiving attachments from arbitrary external senders.
"""
import os
import smtplib
import imaplib
import email
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import make_msgid

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

IMAP_HOST = os.getenv("IMAP_HOST", "imap.gmail.com")
IMAP_PORT = int(os.getenv("IMAP_PORT", "993"))
IMAP_USER = os.getenv("IMAP_USER", SMTP_USER)
IMAP_PASSWORD = os.getenv("IMAP_PASSWORD", SMTP_PASSWORD)

ALLOWED_ATTACHMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


class EmailClientError(Exception):
    pass


def _check_configured():
    if not SMTP_USER or not SMTP_PASSWORD:
        raise EmailClientError(
            "SMTP_USER/SMTP_PASSWORD not set in .env -- see README for Gmail App Password setup"
        )


def send_email(to_address: str, subject: str, body: str) -> str:
    """Sends a real email. Returns the Message-ID (used later to match
    the employee's reply back to this specific request via threading)."""
    _check_configured()

    msg = MIMEMultipart()
    msg["From"] = SMTP_USER
    msg["To"] = to_address
    msg["Subject"] = subject
    message_id = make_msgid()
    msg["Message-ID"] = message_id
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, [to_address], msg.as_string())
    except smtplib.SMTPException as e:
        raise EmailClientError(f"Failed to send email: {e}") from e

    return message_id


def _extract_safe_attachments(msg) -> list[dict]:
    """Pulls attachments matching the allowed extension/size rules only.
    Filenames are NOT trusted -- caller must still generate a safe
    server-side filename before writing to disk, this only filters
    which attachments are even worth considering."""
    results = []
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        filename = part.get_filename()
        if not filename:
            continue
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
            continue
        payload = part.get_payload(decode=True)
        if not payload or len(payload) > MAX_ATTACHMENT_SIZE_BYTES:
            continue
        results.append({"original_filename": filename, "extension": ext, "content": payload})
    return results


def _extract_plain_text_body(msg) -> str:
    """Best-effort plain text extraction, for callers that need the
    reply's actual words (e.g. feedback summarization) rather than just
    its attachments. Falls back to an empty string if the reply is
    HTML-only or unparseable -- never raises, since a missing body
    shouldn't block attachment handling for callers that don't need it."""
    try:
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain" and not part.get_filename():
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        return payload.decode(charset, errors="replace").strip()
            return ""
        if msg.get_content_type() == "text/plain":
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                return payload.decode(charset, errors="replace").strip()
        return ""
    except Exception:
        return ""


def check_for_reply(in_reply_to_message_id: str) -> dict | None:
    """Searches the inbox for a reply to a specific sent message
    (matched via the In-Reply-To / References threading headers, not
    just sender address -- more robust than trusting what the employee
    writes in their reply body). Returns None if no reply found yet."""
    _check_configured()

    try:
        conn = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
        conn.login(IMAP_USER, IMAP_PASSWORD)
        conn.select("INBOX")

        search_key = in_reply_to_message_id.strip("<>")
        status, data = conn.search(None, f'(HEADER "In-Reply-To" "{search_key}")')
        if status != "OK" or not data or not data[0]:
            status, data = conn.search(None, f'(HEADER "References" "{search_key}")')

        if status != "OK" or not data or not data[0]:
            conn.logout()
            return None

        latest_id = data[0].split()[-1]
        status, msg_data = conn.fetch(latest_id, "(RFC822)")
        conn.logout()

        if status != "OK" or not msg_data or not msg_data[0]:
            return None

        raw_email = msg_data[0][1]
        msg = email.message_from_bytes(raw_email)
        attachments = _extract_safe_attachments(msg)
        body_text = _extract_plain_text_body(msg)

        return {
            "from": msg.get("From", ""),
            "subject": msg.get("Subject", ""),
            "attachments": attachments,
            "body_text": body_text,
        }
    except imaplib.IMAP4.error as e:
        raise EmailClientError(f"IMAP check failed: {e}") from e
