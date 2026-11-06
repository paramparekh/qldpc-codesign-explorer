# Vercel-only deployment from GitHub

Both projects use `paramparekh/qldpc-codesign-explorer`, production branch `main`:

| Vercel project | Root Directory | Configuration |
| --- | --- | --- |
| `qldpc-codesign-explorer` | repository root | `vercel.json`, Vite frontend |
| `qldpc-codesign-explorer-api` | `backend` | `backend/vercel.json`, FastAPI |

The frontend calls the API HTTPS origin through `VITE_API_URL`. Set this public
build-time variable on the frontend project to the API production origin,
without a trailing slash or `/api`. Never put a credential in it. The build
rejects a missing or local URL.

## Experiments on Vercel

On Vercel (`VERCEL=1`), the API uses a private Vercel Blob store connected to the
API project. Vercel supplies `BLOB_READ_WRITE_TOKEN`. Checkpoints are immutable
JSON objects. Competing advance/cancel requests attempt the same next revision;
the losing request reloads the winner. Catalog queries find the newest revision,
and downloads use immutable URLs to avoid stale overwritten CDN content.

Creating an experiment saves its settings. GET requests read saved state.
While an active run is open, the frontend sends POST requests to
`/api/experiments/{id}/advance`. Each computes at most 1,000 shared error samples
and stops after about 2.5 seconds of computation, then saves a checkpoint before
responding. Seed derivation uses the original probability and trial indices;
batching preserves paired samples, counts, Wilson intervals, saved failures, and
disagreements. Timing depends on the execution environment.

Closing the page pauses computation after the current request. Reopening an
active saved run resumes it. A failed invocation can retry from the last
committed checkpoint. Stop preserves complete pairs and supports JSON/CSV
exports, including when no trials have completed. No background thread or local
database is required on Vercel. Local development retains SQLite and its worker.

Blob paths are separated by `VERCEL_ENV`. Production and development use
different namespaces. Configure a connected store and explicit allowed origin
for Preview deployments if previews should run experiments.

## Backend settings

- `backend/.python-version` selects Python 3.12.
- Framework: FastAPI; entrypoint: `app.main:app`.
- Set `QLDPC_FRONTEND_ORIGINS` to the exact frontend production HTTPS origin.
  Additional allowed origins can be comma-separated.
- Connect the private Blob store to the required environments. Storage
  credentials remain on the backend.
- Keep the function duration at 60 seconds or more for imports, storage requests,
  and bounded batches. A request never needs to run the whole experiment.

The API is a shared research prototype without per-user accounts. Experiment
history is shared with people who can access the API. Private Blob storage
prevents direct unauthenticated file access; the API still exposes shared history.

## Verification

Verify `/api/system/status`, `/api/codes`, Configure through Results, BP+OSD,
paired experiments, cancellation, JSON/CSV downloads, reopening, and resume.
Confirm results survive a new backend deployment. Both projects deploy from
GitHub. Vercel and Blob usage remain subject to the account plan and quotas.
