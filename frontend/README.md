# Frontend

This folder contains the React interface for the AI-Powered Customer Sentiment Dashboard. It is a Vite app written in JavaScript.

Implemented now:

- A page titled “Customer Sentiment Dashboard”
- A relative request to `/api/health`
- Loading, connected, and connection-failed states
- A Retry button after the check finishes
- The words “Backend connected” only when the response succeeds and its JSON contains `status: "ok"`
- A Vite development proxy from `/api` to the local Functions host at `http://127.0.0.1:7071`
- `public/staticwebapp.config.json`, which Vite copies into the build output and sets the API runtime to `python:3.11`

The interface is intentionally small so it can grow.

Planned work for this folder:

- A page where a user can submit one customer review
- CSV upload for a batch of reviews
- Views for review history, charts, trends, and filters

Azure Static Web Apps is the planned host. In Azure, the page calls Functions on the same origin. The Vite proxy is used only by `npm run dev`.

## Run locally

Start the API first. The commands are in [docs/setup.md](../docs/setup.md). Then, from the repository root in a second PowerShell window:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

Build the site with:

```powershell
npm run build
```

The output directory is `dist`. Static Web Apps should use app location `frontend`, API location `api`, and output location `dist`.
