# Deploy from GitHub to Vercel

Vercel hosts the React frontend. The FastAPI backend currently needs a persistent
Python service: experiments run in a thread pool and save to SQLite. Deploying
that backend unchanged as a serverless function would not provide reliable
background execution or saved experiments.

## Backend

Run Python 3.11 or newer on a host with a persistent disk and HTTPS. From the
`backend` directory, install with `python -m pip install .` and start with:

```sh
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

Use the port required by the host in place of 8000. Keep one process and one
replica while using the current SQLite store and in-process experiment manager.
Set these environment variables on the backend:

- `QLDPC_EXPERIMENT_DB`: an absolute file path on the persistent disk, such as
  `/data/experiments.sqlite3`.
- `QLDPC_FRONTEND_ORIGINS`: the exact frontend origins allowed to call the API,
  separated by commas, such as `https://your-project.vercel.app`. Add preview
  deployment origins explicitly if those deployments need API access.

Check `https://YOUR_API_HOST/api/system/status` before connecting the frontend.
The API is currently a shared research prototype with no user authentication;
experiment history is shared among people who can access the API.

### Railway from this GitHub repository

The root `railway.json` builds `backend/Dockerfile`. Keep the Railway service's
Root Directory at the repository root; the Dockerfile copies only backend code.
It uses Python 3.12, one Uvicorn worker, the platform's `PORT`, and the API's
readiness endpoint. It disables sleep and requires a volume mounted at `/data`.
If Docker is unavailable locally, verify Railway's image build and health check
before publishing.

1. Create a Railway service from `paramparekh/qldpc-codesign-explorer`, branch
   `main`. Keep one replica and disable sleep/serverless mode so running
   experiments can finish between requests.
2. Attach a persistent volume at `/data` **before the first deployment**. The
   image sets `QLDPC_EXPERIMENT_DB=/data/experiments.sqlite3`. The volume is
   configured in Railway, not created by `railway.json`.
3. Set `QLDPC_FRONTEND_ORIGINS` to the Vercel production origin and redeploy
   after any origin changes. Add explicit preview origins only when needed.
4. Generate a public HTTPS domain for port `PORT` and verify
   `/api/system/status` and a short experiment. Copy the domain's origin into
   Vercel's `VITE_API_URL` and deploy the frontend.
5. Verify that a saved experiment remains available after a backend redeploy.
   Export important results before deployments: an in-progress experiment is
   marked failed if the backend restarts.

Railway account access and a suitable resource allowance are required. Check
[Railway pricing](https://railway.com/pricing) before enabling a paid plan.

## Vercel Git integration

1. Import `paramparekh/qldpc-codesign-explorer` from GitHub into Vercel.
2. Leave Root Directory at the repository root. The root `vercel.json` installs
   frontend dependencies, builds the frontend, and publishes `frontend/dist`.
3. Use Node.js 22 or newer. Add `VITE_API_URL` for Production and any Preview
   environments that should work. Its value must be the backend's HTTPS origin
   without a trailing slash, for example `https://api.example.com`. Do not include
   `/api`; the frontend supplies it. This is a public build-time setting, so never
   put a credential in it.
4. Set the production branch to `main`, deploy, and add the resulting Vercel
   origin to `QLDPC_FRONTEND_ORIGINS` on the backend.
5. Verify Configure, Inject, Observe, Decode, and Results, including a short
   paired experiment and a JSON export. Subsequent pushes to `main` deploy
   automatically through the GitHub integration.

The Vercel build rejects a missing or local API origin. A successful static build
alone does not establish that the backend is reachable or that its disk is
persistent; verify both after deployment.
