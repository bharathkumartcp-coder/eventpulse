# EventPulse – Production Cloud Deployment Guide

This guide details the complete deployment workflow for **EventPulse**, covering:
1. **Cloud Database (Supabase PostgreSQL & Realtime)**
2. **Cloud Backend (Render / Railway / Docker / Fly.io)**
3. **Cloud Frontend (Vercel / Netlify / Nginx Container)**
4. **1-Click Infrastructure as Code (`render.yaml`)**
5. **Local Containerized Stack (`docker-compose.yml`)**

---

## Architecture Overview

```
[ Gate Scanner / Attendee Mobile / Organizer Browser ]
                       │
                       │ HTTPS
                       ▼
         ┌───────────────────────────┐
         │  Vercel Edge Network CDN  │  (Frontend React 18 SPA)
         │  https://app.eventpulse.io│
         └─────────────┬─────────────┘
                       │
                       │ REST API (/api/*)
                       ▼
         ┌───────────────────────────┐
         │  Render / Railway API     │  (Backend Node.js Express)
         │  https://api.eventpulse.io│
         └─────────────┬─────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
┌──────────────────┐       ┌──────────────────────┐
│  Supabase Cloud  │       │  Supabase Realtime   │
│  PostgreSQL DB   │       │  WebSocket Channels  │
│  - Events        │       │  (Live check-in sync)│
│  - Attendees     │       └──────────┬───────────┘
│  - Check-Ins     │                  │
│  - Invalid Logs  │                  ▼
└──────────────────┘       [ Live Organizer Dashboard ]
```

---

## Method 1: 1-Click Infrastructure Deployment (Render Blueprint)

EventPulse includes a [render.yaml](file:///C:/Users/Bharath%20Kumar/.gemini/antigravity-ide/scratch/eventpulse/render.yaml) blueprint file at the repository root that deploys both the backend API and frontend static site together.

1. Push your repository to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**.
3. Connect your repository. Render will automatically detect `render.yaml`.
4. In the environment setup, provide your **Supabase** credentials:
   - `SUPABASE_URL`: `https://<your-project>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: `<your-supabase-service-role-key>`
   - `VITE_SUPABASE_URL`: `https://<your-project>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `<your-supabase-anon-key>`
5. Click **Apply**. Render will automatically provision and deploy both services!

---

## Method 2: Standard Dual Cloud Provider (Vercel + Render)

### Step 1: Database Provisioning (Supabase)

1. Create a new PostgreSQL database project at [supabase.com](https://supabase.com/).
2. Open the **SQL Editor** tab.
3. Paste and run the entire [schema.sql](file:///C:/Users/Bharath%20Kumar/.gemini/antigravity-ide/scratch/eventpulse/database/schema.sql) file.
4. Enable realtime replication by running:
   ```sql
   ALTER TABLE checkins REPLICA IDENTITY FULL;
   ALTER PUBLICATION supabase_realtime ADD TABLE checkins;
   ```
5. Navigate to **Project Settings** → **API** and copy:
   - **Project URL**
   - **`anon` Public Key**
   - **`service_role` Secret Key** (keep confidential!)

---

### Step 2: Backend API Deployment (Render / Railway)

1. Go to [Render](https://render.com) → **New Web Service**.
2. Connect your GitHub repository and set:
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Add the following Environment Variables in Render:
   | Key | Value / Example | Notes |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Enables production optimizations |
   | `PORT` | `4000` | Port for Express |
   | `JWT_SECRET` | `generate-random-64-char-string` | Secret for signing tokens |
   | `SUPABASE_URL` | `https://your-project.supabase.co` | From Supabase API settings |
   | `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` | Confidential service role key |
   | `CORS_ORIGIN` | `https://your-frontend.vercel.app` | Updated after deploying frontend |
   | `RATE_LIMIT_WINDOW_MS` | `60000` | 1 minute window |
   | `RATE_LIMIT_MAX_REQUESTS` | `60` | 60 check-in requests/min |
4. Deploy the service. Your backend URL will be:
   `https://eventpulse-api.onrender.com`

---

### Step 3: Frontend Deployment (Vercel)

1. Go to [Vercel](https://vercel.com) → **Add New** → **Project**.
2. Select your repository and configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
3. Add the following Environment Variables in Vercel:
   | Key | Value / Example | Notes |
   | :--- | :--- | :--- |
   | `VITE_API_URL` | `https://eventpulse-api.onrender.com` | Live Render backend URL |
   | `VITE_SUPABASE_URL` | `https://your-project.supabase.co` | Supabase URL |
   | `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` | Safe public anon key |
4. Click **Deploy**. Vercel will build the SPA and provide your live URL:
   `https://eventpulse.vercel.app`
5. Return to Render and set `CORS_ORIGIN` to `https://eventpulse.vercel.app`.

---

## Method 3: Containerized Deployment (Docker / Docker Compose)

EventPulse includes multi-stage production Dockerfiles with asset caching and Nginx reverse proxying.

### Run Locally with Docker Compose
```bash
# 1. Export required environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-key"
export VITE_SUPABASE_URL="https://your-project.supabase.co"
export VITE_SUPABASE_ANON_KEY="your-anon-key"

# 2. Build and start containers
docker-compose up -d --build
```
* **Frontend**: `http://localhost:8080`
* **Backend API**: `http://localhost:4000`

---

## Post-Deployment Validation Checklist

After deployment, verify that all systems are operational:

- [ ] **Health Endpoint**: Visit `https://your-backend.onrender.com/health` → returns `{"status":"ok"}`.
- [ ] **Organizer Auth**: Register a new account on the live frontend.
- [ ] **Event Creation**: Create an event and add an attendee.
- [ ] **QR Code Verification**: View and download the QR code image.
- [ ] **Camera Check-In**: Open the scanner on a smartphone or webcam and scan the QR code.
- [ ] **Duplicate Prevention**: Scan the same QR code a second time → verifies `ALREADY_CHECKED_IN` warning.
- [ ] **Realtime Sync**: Open the Dashboard on two devices; check in on one device and verify instant live incrementation on the second device.
