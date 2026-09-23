# qLDPC CoDesign Explorer

An HCI-focused research prototype for making the path from quantum-code structure to error syndrome and decoder evidence inspectable.

This repository currently contains the system foundation: a tested FastAPI readiness boundary, a React application shell, a shared workflow model, and a restrained visual system. The Configure, Inject, Observe, and Decode capabilities will be implemented as vertical slices on top of this foundation.

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

The foundation intentionally does not simulate a code, inject errors, calculate a syndrome, or run a decoder yet. Its job is to make those capabilities straightforward to add without coupling scientific state to presentation components.

