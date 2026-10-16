import io
from typing import Dict, Any
from pypdf import PdfReader

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit
MAX_EXTRACT_CHARS = 35000               # Bounded size to protect low-resource devices & local context

class DocumentParsingError(Exception):
    pass

def extract_text_from_bytes(filename: str, content_bytes: bytes) -> Dict[str, Any]:
    if len(content_bytes) > MAX_FILE_SIZE_BYTES:
        raise DocumentParsingError(
            f"File '{filename}' exceeds maximum allowed size of {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB."
        )

    ext = filename.lower().split(".")[-1] if "." in filename else ""
    extracted_text = ""
    pages_count = 1

    if ext == "pdf":
        try:
            reader = PdfReader(io.BytesIO(content_bytes))
            pages_count = len(reader.pages)
            extracted_pages = []
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text() or ""
                extracted_pages.append(f"--- Page {i+1} ---\n{page_text}")
                if sum(len(p) for p in extracted_pages) > MAX_EXTRACT_CHARS:
                    break
            extracted_text = "\n\n".join(extracted_pages)
        except Exception as e:
            raise DocumentParsingError(f"Failed to parse PDF document: {str(e)}")
    elif ext in ["txt", "md", "markdown", "csv", "json", "py", "js", "html", "css", "rst"]:
        try:
            extracted_text = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                extracted_text = content_bytes.decode("latin-1")
            except Exception as e:
                raise DocumentParsingError(f"Failed to decode text file: {str(e)}")
    else:
        raise DocumentParsingError(
            f"Unsupported file format '.{ext}'. Supported formats: .txt, .md, .pdf, .json, .csv, code files."
        )

    is_truncated = False
    if len(extracted_text) > MAX_EXTRACT_CHARS:
        extracted_text = extracted_text[:MAX_EXTRACT_CHARS] + "\n\n... [Truncated for local device memory protection] ..."
        is_truncated = True

    clean_text = extracted_text.strip()
    return {
        "filename": filename,
        "extension": ext,
        "size_bytes": len(content_bytes),
        "char_count": len(clean_text),
        "estimated_tokens": len(clean_text) // 4,
        "pages_count": pages_count,
        "is_truncated": is_truncated,
        "text": clean_text
    }
