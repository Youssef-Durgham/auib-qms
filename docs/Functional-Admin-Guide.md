# AUIB Queue System (QMS) — Functional Administration Guide

**Audience:** Registration Department — Functional Administrator (Tier 1)
**System:** Visitor queue / ticketing for the service counters
**Document version:** 1.0 — 2026‑06‑23

> Under the AUIB Shared Responsibility Model, the **Registration department owns the daily running** of the queue system. As the Functional Administrator you do **not** need to know how the code works — this guide is your step‑by‑step manual for the everyday settings and the first‑line checks to do **before** calling IT.
>
> - **You (Tier 1):** services, employees, daily content, daily reset, basic troubleshooting.
> - **Central IT (Tier 2):** the server, the network, backups, "the whole thing is down."
> - **OpEx / Developers (Tier 3):** real software bugs and new features.

---

## 1. The Four Screens (what each one is for)

| Screen | Open it at | Who uses it |
|--------|-----------|-------------|
| **Ticket kiosk** | `/ticket` | The visitor — picks a language and a service, takes a printed ticket |
| **Display board** | `/display` | The big TV/monitor in the hall — shows "Now Serving" and announces by voice |
| **Counter** | `/counter` | Each desk operator — logs in and calls the next visitor |
| **Admin** | `/admin` | You — manage services, staff, content and settings |

Open the public address (e.g. `https://<your-qms-address>`) and pick the screen, or go straight to the path.

---

## 2. Daily Startup Checklist

1. **Display screen(s):** open `/display` on each hall TV and leave it running all day. *(This screen also triggers the automatic daily reset — keep at least one open.)*
2. **Kiosk(s):** open `/ticket` (or `/ticket?kiosk=1` for automatic printing) on each kiosk; print one test ticket.
3. **Counters:** each operator opens `/counter` and **logs in** with their own username/password. Their desk now shows as **open**.
4. Glance at **Admin → Dashboard** to confirm waiting/serving counts look right and the queue numbering is fresh for the day.

---

## 3. Managing Services (Categories)

**Admin → Categories.** Each service the visitor can choose is a "category."

Each service has:

| Field | What it does |
|-------|--------------|
| **Name** | English service name shown on the kiosk (e.g. *Registration*) |
| **Arabic name** | Shown when the visitor picks Arabic |
| **Prefix** | The letter on the ticket (e.g. `R` → tickets `R1, R2, …`) |
| **Daily limit** | Max tickets per day. **0 = unlimited.** When the limit is reached the service shows as closed on the kiosk |
| **Start number** | The first number for this service's tickets (e.g. start 2000 → `R2000, R2001…`) |
| **Closed message** | The message shown to a visitor when the service is full/closed |

**To add or edit a service:** open the Categories tab → add a row or edit an existing one → set the fields above → **Save**. Changes appear on the kiosk immediately.

> Tip: keep prefixes short and unique (one letter) so tickets and the display stay easy to read.

---

## 4. Managing Employees & Counters

**Admin → Employees.**

- **Add an operator:** create a username + password, their display name, and the **counter number** they sit at.
- **Assign services:** set which **categories** that operator handles. When they press *Next*, they only get visitors for those services. *Leave services empty = they handle everything.*
- **Role:** `employee` for desk operators; `admin` only for people who should change settings (like you).
- **Remove someone:** set them to **inactive** (don't delete) — they can no longer log in, but their history stays for reporting.

> A counter "opens" automatically when its operator logs in on `/counter`, and shows their name on the display.

---

## 5. Daily Reset & Service Limits

- **Automatic daily reset:** **Admin → Settings → Auto‑reset time** (default `00:00`). At that time the queue empties and numbering starts fresh. *Keep at least one Display screen open so the reset runs — if no display was open overnight, use the manual reset below in the morning.*
- **Manual reset (whole queue):** **Admin → Dashboard → Reset.** Use only when needed (e.g. testing, or a stuck queue at the start of the day). It cancels all waiting/serving tickets.
- **Reopen a single full service before reset time:** **Admin → Dashboard → reset that category's limit** (or "reset all limits"). The service starts counting again from zero and reopens for visitors immediately.

---

## 6. Display Board Content

**Admin → Voice / Videos / Settings.**

- **Voice (announcements):** choose the voice, speed and pitch, then **preview** it. This is the voice that says e.g. *"Ticket R5, please proceed to desk 3."*
- **Videos:** upload promotional/info videos to play on the left side of the display. Keep each file reasonably small (large files can stutter on the hall TV).
- **Ticker messages:** add custom scrolling messages (announcements, opening hours, etc.) shown along the bottom of the display.

---

## 7. Reports (Analytics)

**Admin → Analytics** shows: today's totals (waiting / serving / served / cancelled), average wait and serve times, busiest hours, and **per‑employee performance** (tickets served, average serve time), plus a 7‑day trend.

Pull these routinely to monitor service levels and spot bottlenecks. If numbers look obviously wrong (not just busy/slow), note the details and escalate (see §9).

---

## 8. Operator Quick Reference (for desk staff)

On `/counter` after login:

| Button | Use it when |
|--------|-------------|
| **Next** | Ready for the next visitor — calls the next waiting ticket for your services |
| **Recall** | The visitor didn't come — rings/announces again (after 3 recalls the ticket is auto‑cancelled as a no‑show) |
| **Skip** | Mark a no‑show and move on |
| **Transfer** | Send the current visitor to another counter (e.g. a specialist) |
| **Complete** | Finished with this visitor — frees your desk |

---

## 9. Tier‑1 Troubleshooting (check these **before** calling IT)

| Problem | What you can do yourself |
|---------|--------------------------|
| **Operator gets "No tickets waiting" or buttons do nothing** | Have them **log out and log back in** on `/counter` (the login simply expired). Resolves most counter issues. |
| **A service won't issue tickets / shows closed** | Check its **daily limit** in Categories — if reached, reset that limit (§5) or raise the limit. |
| **Display not updating / frozen** | **Refresh the browser** on that Display screen. Make sure the page is `/display`. |
| **No voice on the display** | Check the TV/PC **volume and audio output**; try the Voice **preview** in Admin. |
| **Kiosk won't print** | Check the **printer** (paper/power) and the kiosk's print helper. The kiosk also offers the normal browser print as a fallback. |
| **Queue didn't reset this morning** | Use **Manual reset** (§5), then make sure a Display screen stays open overnight. |
| **Wrong service/prefix/Arabic name on a ticket** | Fix it in **Categories** and Save — no IT needed. |
| **An operator can't see settings** | They have the `employee` role; only `admin` users change settings. Promote them in Employees if appropriate. |

If the fix is in this table, **you can do it** — that's the point of Tier 1.

---

## 10. When to Escalate (and what to include)

**Escalate to Central IT (Tier 2)** when:
- The whole system is unreachable, or every screen is down.
- Pages show server errors after a refresh.
- Voice/printing fails on the host even though volume/printer are fine.
- Anything involving the server, network, backups or the website address/certificate.

**Escalate to OpEx / Developers (Tier 3)** — usually *through* IT — when:
- The system behaves wrongly in a way that isn't a setting (e.g. numbers are clearly miscalculated, an action does the wrong thing every time).
- You need a **new feature** or a change to how the system works.

**Always include:**
1. The exact **time** it happened.
2. **Which screen** (kiosk / display / counter / admin) and **which counter/user**.
3. **What you did** and **what you expected** vs what happened.
4. A **photo/screenshot** if possible.

---

## 11. Do's and Don'ts

- ✅ Use **inactive** instead of deleting employees.
- ✅ Keep at least one **Display** screen open all day (it drives announcements *and* the daily reset).
- ✅ Change service settings during quiet periods when you can.
- ❌ Don't share the **admin** login with desk operators — give them `employee` accounts.
- ❌ Don't run **Manual Reset** during a busy queue unless you intend to clear everyone.
- ❌ Don't ask IT for things on this Tier‑1 list — you can do them faster yourself.

---

## 12. Glossary

- **Ticket / number:** the queue number a visitor receives (e.g. `R5`).
- **Category / Service:** a service the visitor can pick (Registration, Finance, …).
- **Prefix:** the letter in front of a ticket number, per service.
- **Counter:** a physical service desk, identified by a number.
- **Recall:** calling a visitor again when they didn't show.
- **Reset:** clearing the queue so numbering starts fresh (daily automatic, or manual).
- **Functional Administrator:** you — the department owner of the system's daily settings (Tier 1).
