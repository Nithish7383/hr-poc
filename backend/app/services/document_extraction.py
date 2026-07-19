"""
Turns a document file on disk into plain text, regardless of whether it
arrived as a text-based PDF, a SCANNED/image-based PDF (no real text
layer -- confirmed to be the case for this fixture's *_Scanned.pdf
files), or a standalone image. Used by document_validator_agent to
check document content -- never raises out to the caller; any
extraction failure just means "no text available", which is itself a
validation signal (likely corrupt/blank/unreadable), not a system error.
"""
import os

import pdfplumber
import pytesseract
from PIL import Image
from pdf2image import convert_from_path


class ExtractionError(Exception):
    pass


def extract_text(file_path: str) -> str:
    """Returns extracted text, or "" if extraction succeeded but found
    nothing readable. Raises ExtractionError only for genuinely
    unsupported files (e.g. missing file, unknown extension) -- callers
    should still treat that as "no evidence", not crash the pipeline."""
    if not file_path or not os.path.exists(file_path):
        raise ExtractionError(f"File not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()

    try:
        if ext == ".pdf":
            return _extract_from_pdf(file_path)
        elif ext in (".jpg", ".jpeg", ".png"):
            return _extract_from_image_file(file_path)
        else:
            raise ExtractionError(f"Unsupported file type: {ext}")
    except ExtractionError:
        raise
    except Exception:
        # Any library-level failure (corrupt PDF, unreadable image, etc.)
        # -- treat as "nothing extracted", never crash the caller.
        return ""


def _extract_from_pdf(file_path: str) -> str:
    """Tries the real text layer first (fast, works for text-based
    PDFs). Falls back to OCR per-page for any page with no extractable
    text -- this is the common case for scanned documents wrapped in a
    PDF container (an image with no text layer at all, not just messy
    text), which a text-layer-only approach silently returns nothing
    for."""
    text_parts = []
    needs_ocr_pages = []

    with pdfplumber.open(file_path) as pdf:
        for i, page in enumerate(pdf.pages):
            page_text = (page.extract_text() or "").strip()
            if page_text:
                text_parts.append(page_text)
            elif page.images:
                # No text layer, but there IS an image on the page --
                # this is the scanned-document case, needs OCR.
                needs_ocr_pages.append(i)

    if needs_ocr_pages:
        try:
            rendered_pages = convert_from_path(file_path, dpi=200)
        except Exception:
            rendered_pages = []
        for i in needs_ocr_pages:
            if i < len(rendered_pages):
                ocr_text = pytesseract.image_to_string(rendered_pages[i]).strip()
                if ocr_text:
                    text_parts.append(ocr_text)

    return "\n".join(text_parts).strip()


def _extract_from_image_file(file_path: str) -> str:
    with Image.open(file_path) as img:
        text = pytesseract.image_to_string(img)
    return (text or "").strip()
