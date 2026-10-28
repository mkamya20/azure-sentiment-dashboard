# AI-Powered Customer Sentiment Dashboard

Customer sentiment dashboard built with React, Python, and Azure cloud services.

Users will submit customer reviews one at a time or by CSV upload. The application will analyze sentiment, save the results, and show review history, charts, trends, and filters. Azure Logic Apps will send email alerts when negative feedback exceeds a threshold.

## Planned stack

| Area | Technology |
| --- | --- |
| Frontend | React, built with Vite |
| Backend | Python 3.11 Azure Functions, runtime v4, Python v2 programming model |
| Hosting | Azure Static Web Apps, with its integrated managed Functions backend |
| Sentiment | Azure AI Language prebuilt sentiment analysis |
| Storage | Azure Cosmos DB |
| Alerts | Azure Logic Apps email |
| Resource group | `rg-customer-sentiment` |

## Repository layout

| Path | Purpose |
| --- | --- |
| `frontend/` | React interface. The starter page checks API health. |
| `api/` | Python Functions. The starter exposes `GET /api/health`. |
| `docs/` | Architecture and local setup |
| `sample_data/` | Future synthetic review datasets. The planned required CSV column is `review_text`. |
| `tests/` | Future backend and integration tests |

## Tools

Install these before running the app locally:

- Python 3.11, available as `py -3.11`. The default `python` command on this project machine is not necessarily 3.11.
- Node.js 24.x. This starter was checked with Node.js 24.16.0. Vite 8 requires Node.js `^20.19.0` or `>=22.12.0`, and `frontend/package.json` asks Azure’s build for Node.js 24.
- npm, which is installed with Node.js.
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local), so the `func` command is on your PATH. On Windows you can install it with `winget install Microsoft.Azure.FunctionsCoreTools` or `npm install -g azure-functions-core-tools@4 --unsafe-perm true`.

## Run locally

Use two PowerShell windows. In each one, start at the repository root.

### Terminal 1: API

```powershell
cd api
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item local.settings.json.example local.settings.json
func start
```

If PowerShell refuses to run the activation script, allow scripts for this window only and activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

`Copy-Item` creates the ignored local settings file. Skip that command when `api/local.settings.json` already exists. The example file contains no secrets. `AzureWebJobsStorage` is set to the local storage emulator value `UseDevelopmentStorage=true`, and the health function does not connect to Azure.

When the host is ready, `GET http://127.0.0.1:7071/api/health` returns HTTP 200 and `{"status": "ok"}` with content type `application/json`. No function key is required.

### Terminal 2: frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the Functions host on port 7071. The page shows **Backend connected** only after `/api/health` returns a successful response whose JSON includes `status` equal to `ok`.

Leave both processes running while you use the page.

## Production build

From `frontend/`:

```powershell
npm run build
```

Vite writes the site to `frontend/dist` and copies `public/staticwebapp.config.json` to `frontend/dist/staticwebapp.config.json`.

## Azure Static Web Apps

Configure the GitHub connection in Azure. 
Use these build settings:

| Setting | Value |
| --- | --- |
| App location | `frontend` |
| API location | `api` |
| Output location | `dist` |
