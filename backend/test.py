from app.services.document_extraction import extract_text
import os
print(os.getcwd())
text = extract_text("backend/uploads/1465c80d-803c-430e-ad67-a62fec10cd45/Rachel_Bennett_SSN_Scanned.pdf")
print(repr(text))