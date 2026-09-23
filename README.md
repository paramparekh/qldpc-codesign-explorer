# qLDPC CoDesign Explorer

An HCI-focused research prototype for making the path from quantum-code structure to error syndrome and decoder evidence inspectable.

This repository currently contains the tested system foundation and the complete Configure stage. Configure loads a mathematically verified qLDPC hypergraph-product fixture, presents the calculated code evidence, captures the error-source assumptions, and confirms a reproducible configuration. Inject, Observe, and Decode will be implemented as later vertical slices.

## Repository layout

```text
backend/   FastAPI service and Python tests
frontend/  React + TypeScript application and component tests
docs/      Design decisions and implementation notes
assets/    Existing project diagrams
notes/     qLDPC learning notes
study/     Future reproducible notebooks
```

## Prerequisites

- Python 3.11 or newer
- Node.js 22 or newer
- npm 10 or newer

## Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

The readiness endpoint is available at `http://127.0.0.1:8000/api/system/status`.

Run the backend tests with:

```powershell
.\.venv\Scripts\python -m pytest
```

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

The application is available at `http://127.0.0.1:5173`.

Run the frontend checks with:

```powershell
npm run check
npm test
```

## Current boundary

The product is qLDPC-only. Configure provides the verified HGP repetition-3 `[[13,1,3]]` teaching fixture and manual or seeded code-capacity setup. It does not inject errors, calculate syndromes, run a decoder, estimate a threshold, or make a hardware-feasibility claim.
