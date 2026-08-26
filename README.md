# EventPulse – QR-Based Smart Event Check-In & Attendance Analytics

> A production-grade, fully cloud-hosted event attendance system with real-time analytics, camera QR scanning, atomic duplicate prevention, and live dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  React + Vite Frontend (Vercel)                 │
│  - Organizer Login/Dashboard                    │
│  - QR Generator (qrcode.react)                  │
│  - QR Scanner  (html5-qrcode)                   │
│  - Analytics   (Recharts)                       │
│  - Realtime via Supabase WebSocket              │
└────────────────────┬────────────────────────────┘
                     │ HTTPS REST API
                     ▼
┌─────────────────────────────────────────────────┐
│  Node.js + Express Backend (Render/Railway)     │
│  - JWT auth middleware                          │
│  - Atomic check-in with DB constraint           │
│  - Rate limiting (60 req/min on check-in)       │
│  - Input validation                             │
└───────────┬─────────────────────────────────────┘
            │ Supabase JS SDK (service role)
            ▼
┌─────────────────────────────────────────────────┐
│  Supabase PostgreSQL (Cloud DB) ← Cloud Svc 1  │
│  - events, attendees, checkins, invalid_logs    │
│  - UNIQUE(event_id, attendee_id) on checkins    │
│  - Realtime Publication ← Cloud Svc 2           │
└─────────────────────────────────────────────────┘
```

**Cloud Services:**
1. **Supabase** — PostgreSQL + Realtime WebSocket
2. **Render** (backend) + **Vercel** (frontend) — Cloud hosting

---

## Project Structure

```
eventpulse/
├── frontend/          React + Vite + Tailwind
│   ├── src/
│   │   ├── components/   Layout, StatCard, ProtectedRoute
│   │   ├── pages/        Login, Dashboard, Event, Attendees,
│   │   │                 Scanner, CheckIns, InvalidScans, Analytics
│   │   ├── services/     api.js, supabase.js
│   │   ├── hooks/        useRealtimeDashboard.js
│   │   ├── context/      AuthContext.jsx
│   │   └── App.jsx
│   └── .env.example
├── backend/           Node.js + Express
│   ├── src/
│   │   ├── controllers/  auth, event, attendee, checkIn, analytics
│   │   ├── routes/       authRoutes, eventRoutes, attendeeRoutes, checkInRoutes
│   │   ├── middleware/   auth.js, rateLimiter.js, validate.js
│   │   └── config/      supabase.js, jwt.js
│   └── .env.example
├── database/
│   └── schema.sql     Full PostgreSQL schema with constraints
├── README.md          (this file)
└── deployment.md      Cloud deployment guide
```

---

## Prerequisites

- Node.js v18+
- A [Supabase](https://app.supabase.com) account (free tier works)
- npm or yarn

---

## 1. Supabase Setup

1. Create a project at [supabase.com](https://app.supabase.com)
2. Go to **SQL Editor** and run the full contents of `database/schema.sql`
3. Enable Realtime for live dashboard:
   ```sql
   -- Run in Supabase SQL Editor
   ALTER TABLE checkins REPLICA IDENTITY FULL;
   ALTER PUBLICATION supabase_realtime ADD TABLE checkins;
   ```
4. Get your credentials from **Project Settings → API**:
   - `URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (backend only, never expose)
   - `anon` key → `VITE_SUPABASE_ANON_KEY` (frontend only)

---

## 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Supabase credentials and JWT secret
npm run dev
# Server starts on http://localhost:4000
# Health check: http://localhost:4000/health
```

### Backend .env

```env
PORT=4000
NODE_ENV=development
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CORS_ORIGIN=http://localhost:5173
```

---

## 3. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your backend URL and Supabase anon key
npm run dev
# App starts on http://localhost:5173
```

### Frontend .env

```env
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

---

## 4. Quick Start (Both Together)

```bash
# Terminal 1
cd eventpulse/backend && npm install && npm run dev

# Terminal 2
cd eventpulse/frontend && npm install && npm run dev
```

Open http://localhost:5173, register an organizer account, and start creating events!

---

## 5. Testing the Application

### Test 1 – Valid Scan
1. Create an event
2. Add an attendee
3. Go to Scanner page
4. Open a second browser tab → go to Attendees → click "View QR"
5. Scan the QR with the scanner → ✅ Green success

### Test 2 – Duplicate Scan
Scan the same QR again → ⚠️ Yellow "Already Checked In"
No second database record is created.

### Test 3 – Unknown QR
Go to manual entry → type random text → Submit → 🔴 "Unknown QR Code"
An entry is logged in Invalid Scans.

### Test 4 – Simultaneous Duplicate (via curl)
```bash
# Get a QR token from /api/events/:id/attendees
# Then fire two simultaneous requests
curl -X POST http://localhost:4000/api/events/EVENT_ID/check-in \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"qrToken":"ATTENDEE_QR_TOKEN","entryPoint":"Gate A"}' &

curl -X POST http://localhost:4000/api/events/EVENT_ID/check-in \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"qrToken":"ATTENDEE_QR_TOKEN","entryPoint":"Gate B"}' &
```
→ One succeeds (`CHECKED_IN`), one returns `ALREADY_CHECKED_IN`. DB has exactly 1 row.

### Test 5 – Live Dashboard
Open dashboard in two browser tabs. Check in an attendee in tab 1 → Tab 2 auto-updates.

---

## 6. Sample CSV for Attendee Import

Create a file `attendees.csv`:
```csv
name,email
Alice Johnson,alice@example.com
Bob Smith,bob@example.com
Carol White,carol@example.com
David Brown,david@example.com
Eve Martinez,eve@example.com
```
Go to Attendees page → Import CSV → Upload the file.

---

## 7. API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Register organizer |
| POST | /api/auth/login | No | Login → JWT |
| GET | /api/auth/me | JWT | Current organizer |
| POST | /api/events | JWT | Create event |
| GET | /api/events | JWT | List events |
| GET | /api/events/:id | JWT | Get event |
| PUT | /api/events/:id | JWT | Update event |
| DELETE | /api/events/:id | JWT | Delete event |
| POST | /api/events/:id/attendees | JWT | Add attendee |
| GET | /api/events/:id/attendees | JWT | List attendees |
| POST | /api/events/:id/attendees/import | JWT | CSV import |
| GET | /api/events/:id/attendees/:aid/qr | JWT | QR code PNG |
| GET | /api/events/:id/attendees/export | JWT | CSV export |
| POST | /api/events/:id/check-in | JWT | 🔑 Core check-in |
| GET | /api/events/:id/dashboard | JWT | Live stats |
| GET | /api/events/:id/analytics | JWT | Full analytics |
| GET | /api/events/:id/checkins | JWT | Check-in list |
| GET | /api/events/:id/invalid-scans | JWT | Invalid scan log |

### Check-In Response Examples

**Success:**
```json
{
  "success": true,
  "status": "CHECKED_IN",
  "attendee": { "name": "Alice Johnson" },
  "checkIn": { "entryPoint": "Main Gate", "timestamp": "2025-03-15T10:30:45.123Z" }
}
```

**Duplicate:**
```json
{
  "success": false,
  "status": "ALREADY_CHECKED_IN",
  "message": "This attendee has already checked in."
}
```

**Unknown:**
```json
{
  "success": false,
  "status": "UNKNOWN_ATTENDEE",
  "message": "This QR code is not registered for this event."
}
```

---

## 8. Security Notes

- JWT secret is server-side only (never in frontend)
- Supabase service role key is backend-only
- Frontend uses only the anon key (for Realtime)
- Rate limiting: 60 check-in requests/minute per IP
- All inputs validated with express-validator
- Duplicate prevention via DB UNIQUE constraint (not frontend logic)
- Timestamps generated by DB (DEFAULT NOW()), never from client

---

## 9. Deployment

See `deployment.md` for full Supabase + Render + Vercel deployment guide.
