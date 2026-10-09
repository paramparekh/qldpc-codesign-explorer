from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.codes import router as codes_router
from app.api.decoders import router as decoders_router
from app.api.experiments import router as experiments_router
from app.api.injections import router as injections_router
from app.api.observations import router as observations_router
from app.api.system import router as system_router


app = FastAPI(
    title="qLDPC CoDesign Explorer API",
    description="Tested qLDPC code, error, and syndrome calculations for the learning interface.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(system_router, prefix="/api")
app.include_router(codes_router, prefix="/api")
app.include_router(decoders_router, prefix="/api")
app.include_router(experiments_router, prefix="/api")
app.include_router(injections_router, prefix="/api")
app.include_router(observations_router, prefix="/api")


@app.get("/", tags=["system"])
def read_root() -> dict[str, str]:
    return {
        "service": "qldpc-codesign-explorer-api",
        "status_endpoint": "/api/system/status",
        "documentation": "/docs",
    }
