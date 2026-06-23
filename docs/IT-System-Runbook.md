# AUIB Queue Management System (QMS) — IT System Runbook & Error‑Handling Matrix

**Audience:** Central IT Department & Helpdesk (Tier 2)
**Owner / Tier 3 escalation:** OpEx / Software Development
**System:** `auib-qms` (visitor queue / ticketing for service counters)
**Document version:** 1.0 — 2026‑06‑23

> This is the **Transfer Package** handed from OpEx to IT under the AUIB Shared Responsibility Model.
> IT owns **infrastructure uptime, security, backups and Tier‑2 triage** using this runbook.
> The Registration department (the using department) owns **daily operations** via the *Functional Administration Guide*.

---

## 1. System Summary

A full‑stack web app that issues numbered tickets to visitors and routes them to service counters. Five screens:

| Screen | URL path | Used by |
|--------|----------|---------|
| Landing | `/` | — (hub) |
| Ticket kiosk | `/ticket` (`/ticket?kiosk=1` for auto‑print) | Visitors |
| Display board | `/display` | TV / large monitor in the hall |
| Counter | `/counter` | Service‑desk operators |
| Admin | `/admin` | Functional Administrator / IT |

---

## 2. Architecture & Components

- **Framework:** Next.js 16 + React 19 + TypeScript (single Node process, App Router).
- **Database:** MongoDB (Mongoose ODM) — database name **`AuibQMS`**.
- **Real‑time:** Server‑Sent Events (SSE) held **in process memory** (see §9 — must run a single instance).
- **Text‑to‑speech (announcements):** server‑side **Windows SAPI** (`/api/tts`), cached as WAV by hash of the text.
- **Ticket printing:** kiosk first tries a **local print agent** at `http://localhost:9100/print`, then falls back to the browser print dialog.

---

## 3. Hosting & Deployment

| Item | Value |
|------|-------|
| Host | Windows Server (same host as the other AUIB apps) |
| Process manager | **PM2**, app name **`auib-qms`** |
| Port | **3070** (bound to `0.0.0.0`) |
| Project directory | `C:\Users\Administrator\Documents\Custom Application\auib-qms` |
| PM2 config | `ecosystem.config.cjs` (instances: **1**, autorestart, `max_memory_restart: 600M`, `--max-old-space-size=450`) |
| Public access | Behind the IIS reverse proxy (HTTPS via the wildcard `*.auib.edu.iq` certificate) |

**Important:** `instances: 1` is **required** — see §9. Do **not** switch PM2 to cluster mode.

---

## 4. Build & Restart Procedures (exact commands)

Run all commands from the project directory.

```powershell
# 1. Pull / apply code changes, then build (uses webpack — this is the configured build)
npm run build            # = next build --webpack

# 2. Restart the live process
pm2 restart auib-qms

# 3. Confirm it is online
pm2 list | Select-String "auib-qms"
```

- **Always `npm run build` before restarting** if code changed — `next start` serves the last built `.next` output.
- A failed build can leave a partial `.next`; do **not** restart until the build prints `✓ Compiled successfully`. The running process keeps the previous build in memory until restarted, so the live site is safe during a build.
- Config‑only changes (e.g. `.env.local`) need **only** `pm2 restart auib-qms --update-env` (no rebuild).

---

## 5. Database

- **Connection:** `MONGODB_URI` in `.env.local` (Mongo running locally with admin auth). DB: `AuibQMS`.
- **Connection pooling:** cached singleton in `app/lib/mongodb.ts` (reused across requests).
- **Schemas:** `app/lib/models.ts`.

| Collection | Purpose | Notable fields / indexes |
|-----------|---------|--------------------------|
| `Ticket` | Every ticket issued | `number` (daily global seq), `dateKey` (YYYY‑MM‑DD), `prefix`+`typeSeq` (e.g. F1), `status` (waiting/serving/served/cancelled), `category`, `counterNumber`, `recallCount` (auto‑cancel at 3). Unique partial indexes on `{dateKey,number}` and `{dateKey,category,typeSeq}` prevent duplicate daily numbers. |
| `Counter` | Physical desks | `number` (unique), `currentTicket`, `status` (open/closed), `categories` |
| `Employee` | Operators / admins | `username` (unique), bcrypt `password`, `counterNumber` (unique), `role` (employee/admin), `active`, `categories`, performance counters |
| `Session` | Login sessions | `token` (unique), `employeeId`, `createdAt` with **TTL `expires: 86400`** (auto‑deletes after 24h; sliding — see §8) |
| `Settings` | Key‑value config | keys: `categories`, `autoResetTime`, `ticketStart`, `limitResetAt`, `lastResetDate`, `voiceName/Rate/Pitch`, `videos`, `tickerMessages` |

---

## 6. Environment & Secrets

File: `C:\...\auib-qms\.env.local` (NOT in git). Keys:

| Key | Meaning |
|-----|---------|
| `MONGODB_URI` | Mongo connection string (contains DB credentials) |
| `MONGODB_DB_NAME` | `AuibQMS` |
| `NODE_ENV` | `production` |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | *(optional)* used once by `POST /api/auth/seed` to create the first admin. Fallback defaults are `admin` / `admin123` — **change the admin password after first login.** |

> Treat `.env.local` as a secret. Do not commit it or paste it into tickets/chat.

---

## 7. Scheduled Tasks / Daily Reset

The queue resets each day so numbering starts fresh.

- **Mechanism:** `POST /api/cron/reset` cancels all `waiting`/`serving` tickets and clears counters **if** the configured `autoResetTime` (default `00:00`) has passed and today's reset has not run yet.
- **Trigger:** this endpoint is currently called **from the Display screen** on a ~1‑minute interval. ⚠️ **Therefore the auto‑reset only fires while at least one Display screen is open.**

**IT recommendation (reliability):** create a **Windows Scheduled Task** that calls the reset endpoint independently of any open browser, e.g. run every 5 minutes:

```powershell
# Example (adjust URL to the internal address)
curl.exe -s -X POST http://localhost:3070/api/cron/reset
```

Manual reset is also available to admins (`POST /api/reset`) and from the Admin → Dashboard tab.

---

## 8. Authentication & Sessions

- **Model:** bearer token. Login (`POST /api/auth/login`) → bcrypt‑verifies password → creates a `Session` doc with a random token → client stores it in `localStorage` as `qms-token` → sent as `Authorization: Bearer <token>`.
- **Validation:** `app/lib/auth.ts → getEmployeeFromRequest()` looks up the token, loads the employee, rejects if the employee is inactive or the session is gone.
- **Expiry:** hard 24h TTL on `Session.createdAt`; **sliding** — any authenticated request older than 30 min refreshes it. The Counter page also sends a **heartbeat to `/api/auth/me` every 5 minutes**, so a screen left open all shift stays logged in. If a session truly expires, the user is returned to the login screen (not shown a misleading error).
- **Roles:** `employee` (counter actions only) vs `admin` (employees, categories, settings, reset).

---

## 9. Real‑Time (SSE) — Single‑Instance Constraint

- SSE clients are tracked in an **in‑memory** manager (`app/lib/sse.ts`). Events (`ticket-called`, `ticket-completed`, `ticket-created`, `ticket-recalled`, `ticket-skipped`, `ticket-transferred`, `ticket-auto-cancelled`, `queue-reset`) are broadcast to connected screens; a heartbeat is sent every 15s.
- **Because the client list lives in memory, the app must run as ONE process.** Running PM2 in cluster mode (multiple instances) would mean an event raised on instance A never reaches screens connected to instance B → counters/displays would appear "stuck."
- Clients self‑heal with a **polling fallback** (Counter every 12s, Display every 10s) and reconnect if no heartbeat arrives for 45s. So brief SSE drops recover automatically.

---

## 10. Peripherals & Endpoints (operational notes)

- **TTS / announcements:** `GET /api/tts?text=...` uses Windows SAPI on the host. If announcements go silent, confirm the host still has the SAPI voice installed and the app can spawn it.
- **Print agent:** the kiosk POSTs to `http://localhost:9100/print` on the **kiosk PC** (a small local helper, separate from this app). If tickets stop printing, check that agent/printer first — the QMS app itself is usually fine.
- **Videos:** uploaded under `public/videos/` via `POST /api/videos`; files > ~100 MB are filtered out to avoid stutter on weak TV‑box hardware.
- **Display health:** the Display page has a video watchdog and auto‑reconnect; if it freezes, a browser refresh on that screen is the first step.

---

## 11. Error‑Handling Matrix (Tier‑2 cheat sheet)

| Symptom | Likely cause | First resolution | Escalate to OpEx (Tier 3) if… |
|---------|--------------|------------------|------------------------------|
| Whole site unreachable | Process down / host issue | `pm2 list`; `pm2 restart auib-qms`; check `pm2 logs auib-qms --err` | Restart loops or logs show a code crash |
| App online but pages error | Bad/partial build or DB down | Re‑run `npm run build`; verify MongoDB service & `MONGODB_URI` | Build fails with a code error |
| `next build` fails | Build tooling | Use the configured `npm run build` (webpack). Read the first real error line | Error is in app code, not environment |
| Counter shows **"No tickets waiting"** unexpectedly, or actions silently fail | Session expired / token rejected | Operator logs out & back in; confirm `/api/auth/me` returns 200 with the token | Happens immediately after login (auth misconfig) |
| Display "Now Serving" not updating, but counter works | SSE link dropped on that screen | Refresh the Display browser; confirm only **one** PM2 instance is running | Multiple instances are required for scale (design change) |
| Counters/displays out of sync across screens | App accidentally in cluster mode | Set PM2 back to `instances: 1` and restart | — |
| Queue did **not** reset overnight | Auto‑reset relies on an open Display (see §7) | Run `POST /api/cron/reset` once; set up the Windows Scheduled Task in §7 | — |
| No voice announcements | Windows SAPI / audio on host | Check host audio + SAPI voice; test `/api/tts?text=test` | TTS endpoint returns errors |
| Tickets not printing at kiosk | Local print agent (port 9100) or printer | Check the kiosk's print agent & printer; kiosk falls back to browser print | App returns the ticket but agent never prints |
| Login works but admin can't change settings | User has `employee` role, not `admin` | Promote via Admin → Employees (an existing admin) | — |
| Slow / memory restarts | Hit `max_memory_restart: 600M` | Normal self‑heal; monitor `pm2 monit` | Frequent OOM restarts (possible leak) |
| DB auth / connection errors in logs | Mongo down or credentials changed | Restart MongoDB; verify `.env.local` `MONGODB_URI` | Schema/index errors |

---

## 12. Backup & Disaster Recovery

- **Database:** include the `AuibQMS` Mongo database in the host's nightly Mongo backup (`mongodump`). Queue data is largely daily/transient, but `Employee`, `Counter` and `Settings` (categories, voice, videos config) are **configuration** and must be restorable.
- **Uploaded videos:** back up `public/videos/` (not in source control).
- **Secrets:** keep a secured copy of `.env.local` off‑box.
- **Restore drill:** `mongorestore` the `AuibQMS` DB → `npm run build` → `pm2 restart auib-qms`. Recreate the admin via `/api/auth/seed` only if `Employee` data was lost.

---

## 13. Routine Maintenance Checklist

- [ ] Confirm `auib-qms` is `online` in `pm2 list` (and `pm2 save` after any PM2 change so it survives reboot).
- [ ] Verify the overnight reset ran (queue numbering fresh) — see §7.
- [ ] Check disk space (uploaded videos, TTS cache, logs).
- [ ] Apply OS / security patches and renew the `*.auib.edu.iq` SSL cert before expiry.
- [ ] Confirm the nightly Mongo backup includes `AuibQMS`.
- [ ] Rotate PM2 logs periodically (`pm2 flush` or pm2‑logrotate).

---

## 14. Escalation Path

1. **Tier 1 — Registration Functional Admin:** day‑to‑day config (categories, employees, resets, content). See the *Functional Administration Guide*.
2. **Tier 2 — Central IT (this document):** host/process/DB/network/SSL, restarts, backups, the Error‑Handling Matrix above.
3. **Tier 3 — OpEx / Software Dev:** confirmed code bugs, schema changes, new features, broken integrations. Provide: exact time, screen/role, steps to reproduce, and the relevant `pm2 logs auib-qms` excerpt.

---

## 15. Quick Reference — Files & Endpoints

- **Models / schemas:** `app/lib/models.ts` · **DB connection:** `app/lib/mongodb.ts` · **Auth:** `app/lib/auth.ts` · **SSE:** `app/lib/sse.ts` · **Helpers:** `app/lib/helpers.ts`
- **Auth API:** `/api/auth/{login,logout,me,seed}`
- **Counter API:** `/api/counter/{next,complete,open,recall,skip,transfer}`
- **Queue API:** `/api/tickets` (GET today / POST new) · `/api/reset` · `/api/reset/limit` · `/api/cron/reset`
- **Config/Media:** `/api/settings` · `/api/employees` · `/api/analytics` · `/api/sse` · `/api/tts` · `/api/videos`
