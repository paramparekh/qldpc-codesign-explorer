from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter(prefix="/system", tags=["system"])


class Capability(BaseModel):
    id: str
    label: str
    status: str
    detail: str


class SystemStatus(BaseModel):
    service: str
    api_version: str
    status: str
    capabilities: list[Capability]
    model_boundaries: list[str]


@router.get("/status", response_model=SystemStatus)
def get_system_status() -> SystemStatus:
    """Return explicit capability readiness for the application shell."""

    return SystemStatus(
        service="qldpc-codesign-explorer-api",
        api_version="v1",
        status="ready",
        capabilities=[
            Capability(
                id="workspace-shell",
                label="Workspace shell",
                status="ready",
                detail="Application layout and workflow navigation are available.",
            ),
            Capability(
                id="workflow-contract",
                label="Workflow contract",
                status="ready",
                detail="Configure, Inject, Observe, and Decode have stable identities.",
            ),
            Capability(
                id="code-registry",
                label="Verified code registry",
                status="ready",
                detail="The verified qLDPC HGP [[13,1,3]] teaching fixture is available.",
            ),
            Capability(
                id="syndrome-service",
                label="Syndrome service",
                status="planned",
                detail="No scientific calculation is exposed by this foundation release.",
            ),
            Capability(
                id="decoder-service",
                label="Decoder service",
                status="planned",
                detail="Decoder integration begins after the observable syndrome path is verified.",
            ),
        ],
        model_boundaries=[
            "Configure exposes one verified qLDPC HGP [[13,1,3]] fixture.",
            "No error, syndrome, or decoder result is produced in Configure.",
            "The MVP uses code-capacity noise and perfect syndrome measurements.",
        ],
    )
