# qLDPC CoDesign Explorer

An HCI-focused research prototype for exploring how qLDPC codes detect and correct quantum errors.

The complete Configure → Inject → Observe → Decode → Results workflow is implemented. Configure loads a mathematically checked qLDPC hypergraph-product code and saves the error settings. Inject creates Pauli errors through direct qubit selection or a saved probability and seed. Observe calculates both CSS syndrome components and traces checks to their qubits. Decode offers exact minimum-weight CSS and BP+OSD corrections and verifies whether logical information was preserved. Results compares decoders on identical errors, with confidence intervals, timing, saved failures, and JSON/CSV downloads.

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

### Start both services on Windows

From the project root, run `./start.ps1 -Install` once to install dependencies and launch the app. Later, run `./start.ps1`. Add `-NoOpen` to leave the browser closed. The script checks service readiness and records logs in `tmp/run-logs/`. Stop the backend before updating its Python code or dependencies, then run the script again. Existing saved experiments remain in `backend/data/experiments.sqlite3`.

### Start services separately

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

Real-browser workflow checks run against separate services on ports 8011 and 5184 and a separate experiment database:

```powershell
cd frontend
npx playwright install chromium
npm run test:e2e
```

To use an existing Chrome installation instead, set `$env:PLAYWRIGHT_CHANNEL = 'chrome'` before running the browser checks. Screenshots and failure traces are written to `frontend/test-results/`. Backend tests also use a temporary database, separate from saved application runs.

## Decoder comparison and exports

- Decode lets you switch decoders while keeping the saved error fixed. BP+OSD uses `ldpc==2.4.1`, minimum-sum BP, 30 iterations, parallel scheduling with one thread, and combination-sweep OSD of order 2. Library versions and settings accompany results. See the [upstream decoder documentation](https://software.roffe.eu/ldpc/ldpc/bposd_decoder.html).
- Results compares both decoders by default. Each sampled error is decoded by both before the next trial starts. Cancellation preserves complete pairs. The trial count is the number of shared error samples; comparison doubles the number of decoder calls.
- Depolarizing noise has total error probability p and equal X/Y/Z probabilities p/3. Independent CSS decoding uses component priors 2p/3. For a manually chosen pattern, the displayed p is a decoder assumption. At p = 0 the BP prior is floored at 1e-12 for numerical stability.
- Paired outcome counts distinguish different corrections from different logical outcomes. Saved disagreements and failures can be opened in Observe and Decode; a return button preserves the original result.
- `GET /api/experiments/{id}/export?format=json` downloads the full saved experiment, including settings and failure examples. `format=csv` downloads one row per decoder and probability, including reproducibility metadata and paired counts. Both support stopped partial runs. Decimal seed strings preserve all 63 bits in browsers and JSON consumers; parse them as integers when replaying in Python.
- Reopen recent experiments from Results. The confidence bars show Wilson intervals for each decoder's failure proportion; they are not a paired significance test. Timing includes decoder construction and logical verification and depends on the computer and load.

For another frontend origin, set `QLDPC_FRONTEND_ORIGINS` to a comma-separated list of explicit allowed origins before starting the backend. The default allows localhost and 127.0.0.1 on port 5173.

## Deployment

See [Deploy from GitHub to Vercel](docs/deployment.md) for the frontend build
settings, backend persistence, and GitHub auto-deploys. Both the frontend and API
are hosted on Vercel. Deployed experiments save batches to private Vercel Blob;
keep the page open to run trials, or reopen a saved run to resume it later.

## Current boundary

The product is qLDPC-only. Configure provides the HGP repetition-3 `[[13,1,3]]` code. Inject produces a repeatable Pauli-error vector. Observe calculates the syndrome with exact binary arithmetic. Both decoders distinguish stabilizer-equivalent success from logical failure using the same GF(2) verifier. Exact search minimizes X/Z component weights independently; BP+OSD does not guarantee minimum weight. Neither is claimed to be a maximum-likelihood decoder for correlated X/Z components under depolarizing noise. Batch experiments estimate logical-error rates with Wilson confidence intervals. These small-code comparisons do not constitute a threshold study or demonstrate hardware feasibility. Syndrome measurements are perfect; circuit-level noise and larger code families remain future work.
