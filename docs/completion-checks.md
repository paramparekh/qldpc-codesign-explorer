# Completion checks for milestones 1–4

Implementation date: November 5, 2026.

The starting revision was `e3cbe52` (reproducible batch results). Its baseline passed 33 backend tests, 7 frontend tests, and the TypeScript check before implementation.

## Completed scope

1. Verify the existing five-stage application and preserve a working baseline.
2. Add BP+OSD selection and paired comparison against the exact CSS decoder on identical error samples. Validate syndrome consistency, stabilizer membership, reproducibility, and cancellation.
3. Present both error-rate curves with Wilson intervals and decoder timing; record settings and library versions; export JSON/CSV; reopen saved runs; inspect failures and decoder disagreements.
4. Trace checks to highlighted qubits, explain parity and residual outcomes, improve retry and connection messages, preserve exact seed values, and fix mobile page overflow.

`start.ps1` starts both services and checks readiness. README documents installation, separate startup, tests, scientific assumptions, and exports.

## Validation commands

Final verification passed: 43 backend tests, 11 frontend tests, 3 real-browser workflow tests, the production build, Python dependency consistency, and the npm audit (zero reported vulnerabilities). The startup script was verified both when starting the services and when reusing healthy services. The updated app is served on port 5173 with the API on port 8000.

```powershell
cd backend
./.venv/Scripts/python -m pytest
./.venv/Scripts/python -m pip check
cd ../frontend
npm run build
npm test
$env:PLAYWRIGHT_CHANNEL = 'chrome' # Or install Playwright Chromium and omit this.
npm run test:e2e
npm audit
```

Backend coverage includes all 39 nonidentity single-qubit Pauli errors at three priors, every possible syndrome for each of the two CSS matrices, paired-trial alignment, deterministic outcomes, disagreement replay, cancellation, exports, full-width seed preservation, and compatibility with earlier saved results. Tests use separate databases.

The real-browser checks use the actual API to verify Configure → Inject → Observe → Decode → Results, BP+OSD selection, paired experiments, JSON/CSV downloads, saved-run reopening, failure inspection and return, stabilizer success, logical failure, browser errors, mobile page width, connection-loss messages, and cancelled-run export. Desktop and mobile screenshots were inspected and are saved under `frontend/test-results/`.

Presentation slides, a curated research experiment set, and demo recording/rehearsal remain milestones 5–7.
