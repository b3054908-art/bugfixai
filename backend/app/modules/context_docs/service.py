"""Context Documents: upload/parse/store/list/delete.

This is the missing connector for Phase 1's "optional context docs"
concept -- the DB schema (models/context.py) and its AI-side consumer
(modules/ai/context_builder.py, embedded into the Phase 5/6 prompts)
already existed, but nothing ever created a ContextDocument row. This
module is that missing write path, mirroring the same
extract-to-real-storage pattern modules/uploads/service.py uses for
project archives.
"""
import os
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors.app_error import AppError
from app.common.utils.safe_path import resolve_safe_path
from app.core.storage import project_storage_path
from app.models.context import ContextChunk, ContextDocument

# Same six categories the frontend's ContextDoc['type'] union already
# defines (types.ts) -- kept in sync rather than inventing a new taxonomy.
_TYPE_BY_EXTENSION = {
    ".md": "markdown",
    ".markdown": "markdown",
    ".json": "json",
    ".yaml": "openapi",
    ".yml": "openapi",
    ".pdf": "pdf",
    ".sql": "schema",
    ".prisma": "schema",
}
ALLOWED_EXTENSIONS = set(_TYPE_BY_EXTENSION) | {".txt"}

_MAX_DOC_BYTES = 20 * 1024 * 1024  # 20MB -- generous for text/PDF context docs
_CHUNK_SIZE = 2000
_MAX_CONTENT_TEXT_CHARS = 200_000  # stored on the row; context_builder only reads the first 20 chunks anyway


def _detect_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return _TYPE_BY_EXTENSION.get(ext, "text")


def _extract_text(path: str, ext: str) -> str:
    if ext == ".pdf":
        from pypdf import PdfReader  # imported lazily so a missing wheel doesn't break unrelated routes

        try:
            reader = PdfReader(path)
            return "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as exc:  # pypdf raises several distinct error types for malformed PDFs
            raise AppError(400, "PDF_PARSE_FAILED", f"Could not extract text from this PDF: {exc}") from exc

    with open(path, "rb") as f:
        raw = f.read()
    return raw.decode("utf-8", errors="replace")


def _chunk_text(text: str) -> list[str]:
    if not text:
        return []
    return [text[i : i + _CHUNK_SIZE] for i in range(0, len(text), _CHUNK_SIZE)]


def _format_size(size_bytes: int) -> str:
    return f"{size_bytes / 1024:.1f} KB"


def _to_response(doc: ContextDocument) -> dict:
    return {
        "id": doc.id,
        "name": doc.name,
        "size": _format_size(doc.sizeBytes),
        "type": doc.type,
        "content": doc.contentText or "",
        "uploadedAt": doc.createdAt.strftime("%I:%M %p") if doc.createdAt else "",
        "description": doc.description,
    }


async def store_context_doc(
    db: AsyncSession,
    project_id: str,
    tmp_path: str,
    original_name: str,
    description: str | None,
) -> dict:
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise AppError(
            400,
            "UNSUPPORTED_FILE_TYPE",
            f"'{ext or original_name}' isn't a supported context doc type "
            f"({', '.join(sorted(ALLOWED_EXTENSIONS))})",
        )

    size = os.path.getsize(tmp_path)
    if size > _MAX_DOC_BYTES:
        raise AppError(413, "FILE_TOO_LARGE", "Context doc exceeds the 20MB limit")

    doc_type = _detect_type(original_name)
    text = _extract_text(tmp_path, ext)

    target_dir = os.path.join(project_storage_path(project_id), "context-docs")
    os.makedirs(target_dir, exist_ok=True, mode=0o750)
    stored_name = f"{uuid.uuid4()}-{os.path.basename(original_name)}"
    target = resolve_safe_path(target_dir, stored_name)
    with open(tmp_path, "rb") as src, open(target, "wb") as dst:
        while chunk := src.read(1024 * 1024):
            dst.write(chunk)
    os.chmod(target, 0o640)

    doc = ContextDocument(
        projectId=project_id,
        name=original_name,
        storagePath=target,
        sizeBytes=size,
        type=doc_type,
        contentText=text[:_MAX_CONTENT_TEXT_CHARS],
        description=description,
    )
    db.add(doc)
    await db.flush()  # need doc.id before creating chunks

    for ordinal, chunk_text in enumerate(_chunk_text(text)):
        db.add(ContextChunk(documentId=doc.id, ordinal=ordinal, content=chunk_text))

    await db.commit()
    await db.refresh(doc)
    return _to_response(doc)


async def list_context_docs(db: AsyncSession, project_id: str) -> list[dict]:
    stmt = select(ContextDocument).where(ContextDocument.projectId == project_id).order_by(ContextDocument.createdAt)
    docs = (await db.execute(stmt)).scalars().all()
    return [_to_response(doc) for doc in docs]


async def delete_context_doc(db: AsyncSession, project_id: str, doc_id: str) -> None:
    stmt = select(ContextDocument).where(ContextDocument.id == doc_id, ContextDocument.projectId == project_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if doc is None:
        raise AppError(404, "CONTEXT_DOC_NOT_FOUND", "Context doc was not found")

    if doc.storagePath and os.path.exists(doc.storagePath):
        try:
            os.remove(doc.storagePath)
        except OSError:
            pass  # best-effort -- the DB row (and its chunks, via cascade) is the source of truth

    await db.delete(doc)  # cascades to ContextChunk rows
    await db.commit()
