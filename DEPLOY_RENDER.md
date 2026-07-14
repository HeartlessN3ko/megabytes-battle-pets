# Deploy To Render

## 1. Required env vars

- `MONGODB_URI` (required)
- `JWT_SECRET` (required — login token signing)
- `NODE_ENV=production`
- `AUTH_REQUIRED=true` once the app ships with a login flow (leave unset during solo-dev testing)
- `DEV_MODE` / `DEV_MODE_KEY` — do **not** set on a public deploy

`PORT` is optional on Render (Render injects it automatically).

## 2. Health check

Use:

- `/health`

## 3. Build/start

- Build command: `npm ci`
- Start command: `npm start`

## 4. Frontend API URL

After deploy, set the frontend env var:

- `EXPO_PUBLIC_API_BASE_URL=https://<your-service>.onrender.com`
