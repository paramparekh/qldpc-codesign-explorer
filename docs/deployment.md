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
