# qLDPC CoDesign Explorer

An HCI-focused research prototype for exploring how qLDPC codes detect and correct quantum errors.

The complete Configure → Inject → Observe → Decode → Results workflow is implemented. Configure loads a mathematically checked qLDPC hypergraph-product code and saves the error settings. Inject creates Pauli errors through direct qubit selection or a saved probability and seed. Observe calculates both CSS syndrome components and explains every check result. Decode selects an exact minimum-weight correction and verifies whether the logical information was preserved. Results runs reproducible batch experiments and presents logical-error rates, uncertainty intervals, and saved failures.

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

Batch experiment endpoints are available at `http://127.0.0.1:8000/api/experiments`. Experiments run in the background, report progress, support cancellation, and remain available after completion.

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

The product is qLDPC-only. Configure provides the HGP repetition-3 `[[13,1,3]]` code. Inject produces a repeatable Pauli-error vector. Observe calculates the syndrome with exact binary arithmetic. Decode uses exact minimum-weight CSS search and distinguishes stabilizer-equivalent success from logical failure. Batch experiments estimate logical-error rates with Wilson confidence intervals. They do not yet constitute a threshold study, and the current system makes no hardware-feasibility claims.
