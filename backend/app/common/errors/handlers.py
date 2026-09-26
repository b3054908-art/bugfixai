"""Mirrors: backend/src/common/errors/error.middleware.ts"""
import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.common.errors.app_error import AppError

logger = structlog.get_logger(__name__)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Request validation failed",
                    "details": exc.errors(),
                },
                "requestId": request_id,
            },
        )

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {"code": exc.code, "message": exc.message, "details": exc.details},
                "requestId": request_id,
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", None)
        # Previously this swallowed the exception entirely — nothing was ever
        # logged, so a 500 gave you no traceback anywhere (not in the client
        # response, which is intentional, but also not on the server side,
        # which was a bug). exc_info=exc attaches the full traceback to the
        # structlog output so it actually prints to the uvicorn terminal.
        logger.error(
            "unhandled_exception",
            path=request.url.path,
            method=request.method,
            request_id=request_id,
            exc_info=exc,
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": {"code": "INTERNAL_ERROR", "message": "An unexpected server error occurred"},
                "requestId": request_id,
            },
        )