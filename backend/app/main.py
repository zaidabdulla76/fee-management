from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import app.core.integrity  # noqa: F401 — NFR-1 / FR-4.3 SQLAlchemy guards
from app.api.routes import router
from app.core.config import get_settings
from app.core.integrity import IntegrityError

settings = get_settings()

app = FastAPI(title="Hijri Fee Ledger API", version="2.0.0")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exc(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(IntegrityError)
async def integrity_exc(request: Request, exc: IntegrityError):
    return JSONResponse(status_code=409, content={"error": str(exc)})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": str(exc)})


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "service": "fee-management-api",
        "stack": "fastapi+postgres+gunicorn",
    }


app.include_router(router, prefix="/api")
