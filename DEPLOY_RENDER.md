# Deploy To Render

## 1. Required env vars

- `MONGODB_URI` (required)
- `NODE_ENV=production`

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
