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
    """Return the features that are ready to use."""

    return SystemStatus(
        service="qldpc-codesign-explorer-api",
        api_version="v1",
        status="ready",
        capabilities=[
            Capability(
                id="workspace-shell",
                label="Workspace",
                status="ready",
                detail="The application layout and step navigation are available.",
            ),
            Capability(
                id="workflow-contract",
                label="Project steps",
                status="ready",
                detail="Configure, Inject, Observe, Decode, and Results are available as project steps.",
            ),
            Capability(
                id="code-registry",
                label="qLDPC code",
                status="ready",
                detail="The HGP [[13,1,3]] qLDPC code is available.",
            ),
            Capability(
                id="injection-service",
                label="Error selection",
                status="ready",
                detail="Users can choose errors by hand or generate them from a seed.",
            ),
            Capability(
                id="syndrome-service",
                label="Syndrome calculation",
                status="ready",
                detail="Observe calculates X-type and Z-type check results and explains each result.",
            ),
            Capability(
                id="decoder-service",
                label="Decoder",
                status="ready",
                detail="Decode applies an exact minimum-weight CSS correction and checks its logical effect.",
            ),
            Capability(
                id="experiment-service",
                label="Batch experiments",
                status="ready",
                detail="Reproducible decoder trials can run in the background with progress and saved results.",
            ),
        ],
        model_boundaries=[
            "Configure provides one HGP [[13,1,3]] qLDPC code.",
            "Decode uses exact minimum-weight search for the current 13-qubit code.",
            "Errors affect data qubits only, and syndrome measurements have no errors.",
        ],
    )
