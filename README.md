# TurnoPIN: Simple Clock

Build a production-oriented MVP called TurnoPIN, a Spanish SaaS for very small bars, restaurants and local businesses that need simple employee time clocking from one shared device.

GOAL
Create a full-stack responsive web app with a public marketing site and a private admin area. The core promise is: "Una pantalla. Un PIN. Y a trabajar." Keep the product deliberately simple, fast and mobile-first.

TARGET USER
Owner/manager of a small bar, café, restaurant or local business in Spain, usually 3-30 workers, who does NOT want a full HR suite.

VISUAL STYLE
Clean, sober, trustworthy, modern SaaS. White background, charcoal/navy text, green accent. Large typography, generous spacing, no gradients, no gimmicks. Mobile-first. Spanish copy.

PUBLIC SITE
Pages/sections:
- Hero with headline "Una pantalla. Un PIN. Y a trabajar."
- Subheadline explaining shared tablet/mobile kiosk, 4-digit PIN, no employee app required.
- CTA "Probar 30 días gratis"
- How it works in 3 steps
- Features
- Pricing
- FAQ
- Footer with Privacy, Legal, Terms placeholders

PRICING
- Local: 7,90 €/mes + IVA, up to 10 workers, 1 location
- Local+: 14,90 €/mes + IVA, up to 30 workers, up to 3 locations
- 30-day free trial
Do not claim legal compliance guarantees. Phrase carefully as a time-recording tool.

AUTH / TENANCY
Use the platform's default backend/auth stack.
- Company admin signup/login with email + password
- Multi-tenant data model: every business/company only sees its own data
- Persistent admin session
- Optional role field prepared for future admin/manager roles

CORE DATA MODEL
Company:
- id
- legal_name
- tax_id
- ccc optional
- created_at
- plan
- trial_ends_at
- subscription_status

Worker:
- id
- company_id
- first_name
- last_name
- second_last_name optional
- dni_nie optional
- naf optional
- pin_hash (never store raw PIN)
- status active/archived
- hired_at
- archived_at optional
- created_at

TimeEntry:
- id
- company_id
- worker_id
- work_date
- server_timestamp
- local_time
- type entry/exit
- corrected boolean
- internal_notes optional
- created_at

Correction:
- id
- company_id
- time_entry_id
- worker_id
- original_timestamp
- corrected_timestamp
- reason
- internal_notes optional
- corrected_by_admin_id
- created_at

AuditLog:
- id
- company_id
- actor_id optional
- action
- entity_type
- entity_id
- metadata JSON
- created_at

KIOSK / CLOCK-IN FLOW
A dedicated full-screen kiosk page for tablet/mobile:
- Company title/logo area
- List of active workers by first name + first surname OR a worker selector
- Worker selects their name
- PIN screen with large numeric keypad and also allow direct numeric typing for speed
- 4-digit PIN
- After validation show current status: "TRABAJANDO desde HH:MM" or "FUERA"
- Show today's own time entries after PIN validation
- Do NOT show total hours to the worker
- Show only one contextual primary action:
  - "Entrar a trabajar" if currently outside
  - "Salir del trabajo" if currently working
- No artificial daily limit on number of turns
- Confirmation after clock action
- Time must come from server/backend, never trust client clock
- PIN rate limiting / basic brute-force protection
- Kiosk should remain easy to use on a shared dedicated device

ADMIN DASHBOARD
Sections:
1. Overview:
   - active workers
   - currently working count
   - today entries
   - unresolved anomalies placeholder
2. Workers:
   - create/edit/archive/reactivate worker
   - set/reset 4-digit PIN
   - preserve historical records when archived
3. Records:
   - filter by date and worker
   - chronological timeline
   - highlight corrected entries
4. Corrections:
   - admin can correct an existing record
   - original value must remain preserved
   - require reason
   - append audit log
5. Monthly export:
   - choose worker + month
   - printable monthly report
   - CSV export now
   - prepare UI button for PDF export (can use browser print-to-PDF for MVP if necessary)
6. Settings:
   - company legal name, tax ID, CCC optional
   - subscription plan/status placeholder until Stripe is connected

BUSINESS RULES
- Determine current worker status from the latest valid entry/exit sequence
- Entry while already working should be prevented in normal flow
- Exit while outside should be prevented
- Multiple turns per day are valid
- Never delete time records from the UI
- Corrections create a Correction record and mark original TimeEntry as corrected; do not overwrite history silently
- Every sensitive admin action should create AuditLog
- Keep data scoped to company_id in all reads/writes

SEED / DEMO
Provide a polished demo state with:
- Company "Bar Demo"
- Workers "Ana Pérez", "Luis García", "Marta Ruiz"
- Demo PIN note in developer/demo mode only: Ana uses 2580
- A few sample entries today for visual testing
Do not expose demo PIN in production-mode UI except in an obvious demo banner.

UX DETAILS
- Spanish date/time formatting
- Europe/Madrid timezone for display, while preserving reliable server timestamps
- Responsive sidebar on desktop, bottom/compact navigation on mobile
- Empty states and clear validation
- Success/error toasts
- Accessible controls and large tap targets

SECURITY / PRIVACY
- PIN hashed, never shown after creation/reset
- Server-side authorization on company ownership
- No destructive delete for historical time records
- Basic rate limit concept for PIN attempts
- Clearly label legal/privacy pages as placeholders requiring professional review before commercial launch

DELIVERABLE
Build the app, not just mockups. Create routes, data schema/migrations, auth, working CRUD for workers, working kiosk clock-in/out, records view, corrections, audit trail and CSV export. If any integration cannot be completed without external credentials, create the working UI and architecture, then clearly leave the external credential step isolated for later.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://turnopin.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/660f8e18-d9d0-46e9-9410-568623cb18b6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
