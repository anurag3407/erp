# India-Fit & User-Experience Gap Audit
## Enterprise College ERP v2.0 (`/Users/jarvis/erp`)

**Audit date:** 26 Sep 2026
**Scope:** all 51 TypeScript source files (~6,600 LOC) in `src/`, the 5 test suites in `tests/`, `src/db/schema.ts`, `src/db/migrations.sql`, and the project docs (PRD.md, plan.md, report.md, ERP_COMPETITIVE_ANALYSIS.md).
**Method:** full file-by-file read; ran the master suite (`npm test`) and `npm run typecheck`; ran four purpose-built behavioural probes against the live domain services (probe file deleted after execution). Every finding cites `file:line` evidence and, where behavioural, the probe output.

**Headline verdict.** The codebase is a strong *domain-service prototype* for ten global ERP failure modes plus nine operational gaps — and the suite genuinely passes 100% (65 ms). But measured against how an **Indian** college (affiliated/autonomous, university-conducted exams, UGC/AICTE/NAAC regime, reservation & scholarship machinery, 60–120 student classrooms, ₹8k–15k Android phones, IST) actually operates, there are **14 material domain gaps and 12 UX gaps**, of which **5 are critical**. The single largest finding: **there is no user interface at all** — `package.json` ships `next dev/build` scripts but `next`/`react` are not dependencies (`node_modules/next` absent, no `"next"` key in package.json), and `src/` contains only `db/`, `lib/`, `modules/`, `types/`. Everything labelled "PWA", "optimistic UI" and "offline" is a *specification or data-packager*, not a rendered experience. So "user experience" today is unbuilt and therefore unverifiable; what can be audited is the UX implied by the service contracts — and four of those imply classroom behaviour that will not work in India (B2/C1/C2/C3, all reproduced live).

---

## 0. TL;DR scorecard

| # | India domain | Status | Severity |
|---|---|---|---|
| A1 | Admissions, statutory reservation, quota (Govt/Mgmt), lateral entry | **Absent** | S1 |
| A2 | Identity: Aadhaar eKYC, PRN/university enrolment no., DOB/gender/category | **Absent** (only APAAR ID) | S1 |
| A3 | Fee heads, quota-based FRC pricing, instalments, DD/challan/NEFT, receipts, refunds, no-dues | **Partial** (gateway only) | S1 |
| A4 | Scholarships: NSP, post-matric SC/ST, EBC, fee reimbursement, TFW | **Absent** (hardcoded stat only) | S1 |
| A5 | University exam lifecycle: revaluation, challenge valuation, ATKT/supplementary/arrear, grace marks, best-of-N CIA, malpractice (UGC Unfair Means) | **Partial** (double-blind OSV only) | S1 |
| A6 | Attendance: 75% UGC rule, subject-wise %, condonation, detention lists, lab batches, OD | **Partial + 3 correctness defects** | S1 |
| A7 | Certificates: bonafide, TC/LC, migration, conduct, transcript, railway/bus concession, NOC | **Absent** | S2 |
| A8 | Statutory bodies: anti-ragging affidavits, POSH ICC (90-day), UGC GRC 2019 (15-day), SC/ST & OBC cells, EOC, ombudsman, IQAC | **Partial** (tickets only) | S2 |
| A9 | Accreditation: NAAC DVV/AQAR evidence, NBA CO-PO/SAR, NIRF, AISHE returns | **Partial + fabricated defaults** | S1 |
| A10 | Hostel/mess, transport, placement, alumni, research/PhD, HR-payroll, faculty workload (UGC 16 h / AICTE 1:20) | **Absent** | S2 |
| A11 | University → affiliated-college hierarchy, multi-campus, annual-system institutions | **Absent** (flat single tenant) | S2 |
| A12 | DPDP Act 2023: consent, guardian consent for minors, retention, breach notice | **Absent** | S2 |
| A13 | Credit transfer in: SWAYAM/NPTEL, other-HEI credits via ABC, MOUs | **Partial** (outbound NAD only) | S3 |
| A14 | Indian academic calendar & holiday cycles, exam-fee cycles, templates | **Absent** (blank calendar CRUD) | S3 |
| B1 | Any UI/UX whatsoever (screens, navigation, states) | **Absent** | S1 |
| B2 | Classroom attendance UX (60–120 students, queue, GPS indoors, no-data phones) | **Broken by design** | S1 |
| B3 | Parent/student channels (SMS not dispatched, no WhatsApp, no OTP login) | **Absent** | S1 |
| B4 | Hindi/regional language, accessibility, low-bandwidth mode | **Absent** | S2 |
| B5 | IST timezone/locale correctness (day keys, effective dates, deadlines) | **Broken** | S1 |
| B6 | Fee UX: receipt/invoice PDF, dues view, instalment reminders, UPI collect | **Absent** | S2 |
| B7 | Faculty/admin data entry: Excel import, keyboard-first, offline entry, volatile lock | **Partial** | S2 |
| B8 | Appeal UX for rejected attendance, GPS drift, unfair-means show-cause | **Absent** | S2 |
| B9 | Offline/PWA privacy on shared family phones (grades/fee cache, logout wipe) | **Risky** | S2 |
| B10 | First-run onboarding, empty & error states, progressive disclosure | **Absent** | S2 |
| B11 | Shared-device & kiosk flows (one phone per family, email-based parent login) | **Absent** | S2 |
| B12 | Perf/data budgets for 3G / 2 GB-RAM devices, PDF/image weight | **Absent** | S3 |

---

## 1. What genuinely works (and is India-relevant)

1. **University-style double valuation** — `osvArbitrationService` implements independent Evaluator 1/2 scoring with >15% variance escalation to a Chief Examiner (`src/modules/examination/osvArbitration.ts:54-83`). This matches the double-valuation practice mandated by many Indian universities and is the most transferable exam feature in the repo.
2. **Temporal exclusion for timetables** — `btree_gist EXCLUDE USING gist (room, day, tsrange &&)` plus a TypeScript mirror (`src/db/migrations.sql:214-232`, `src/modules/timetable/temporalExclusion.ts:44-73`) is right for colleges that still clash 60-seat halls between departments. `day_of_week BETWEEN 1 AND 6` already supports six-day weeks — keep it.
3. **No-dues library gate wired to a 48-hour exam pass** (`src/modules/library/libraryService.ts:174-226`) — mirrors real "library clearance before hall ticket" friction, with a humane escape hatch.
4. **Leave → mentor → HOD with substitute-faculty clash check and On-Duty pass** (`src/modules/leave/leaveService.ts:37-191`) — GFM/mentor-first routing and OD passes for hackathons/sports are genuinely Indian idioms.
5. **Statutory-committee routing for grievances** with category SLAs (anti-ragging 24 h, POSH, AGRC) (`src/modules/feedback-grievance/grievanceService.ts:22-43`).
6. **Ed25519 verifiable marksheets with recursive canonicalisation** (`src/lib/crypto.ts:198-232`) — proper asymmetric signatures; `report.md:89-91` documents a real nested-key bug that was found and fixed. Good base for DigiLocker/NAD once a real signature (not a hash) is used for NAD payloads (C8).
7. **Payment webhook idempotency + auto-healing poller** (`src/modules/finance/webhookIdempotency.ts`, `autoHealingPoller.ts`) — the "money deducted, fee still unpaid" problem is real and this addresses it structurally (but see C5/C13 for two dangerous details).
8. **RBAC across 12 institutional roles** with Registrar/COE/HOD/Warden/Librarian — institutional vocabulary is largely correct (`src/types/index.ts:7-19`).
9. **Registration concurrency** — Redis token-bucket waiting room + atomic Lua seat hold + sorted-UUID lock ordering (`src/modules/registration/*`) is a defensible answer to autonomous-college elective registration day (but see C14 for the cache-miss trap).

---

## 2. India gap register

Format: **Requirement → What exists today (evidence) → Operational impact → Fix.**

### A1 — Admissions & statutory reservation · ABSENT · S1
- **Requirement.** Indian admissions run on: category roster (OC/BC/MBC/SC/ST/EWS, state-specific), 3% disabled quota, sports/ex-servicemen quotas, supernumerary seats (single girl child, J&K, NRI/OCI), government-quota vs management-quota intake split (TN/Karnataka/AP), merit lists from CUET/JEE/NEET/state counselling, seat-matrix approval, and lateral entry into semester 3 for diploma holders.
- **Evidence.** No admissions module exists in `src/modules/`. `StudentProfile` (`src/types/index.ts:33-46`, `src/db/schema.ts:65-78`) has **no** `category`, `quota`, `admissionType`, `domicileState`, `isPwD`, `isMinority`, `isFirstGraduate`, `gender`, `dob` or `lastBoard` field. Roles include no Admission Officer (`src/types/index.ts:7-19`).
- **Impact.** Cannot produce a statutory seat-matrix/roster report for the state higher-education department; and category/income/first-graduate/PwD flags are the primary keys of every scholarship rule (A4).
- **Fix.** Add `admission_applications`, `seat_matrix` (programme × category × quota), `admission_merit_list`; extend `student_profiles` with the demographic columns (nullable for legacy data); add an `ADMISSION_OFFICER` role; export roster/seat-matrix CSV in the state portal format.

### A2 — Identity & numbering · ABSENT (except APAAR) · S1
- **Requirement.** Students carry a **PRN / university enrolment number** (distinct from the college roll number) plus APAAR/ABC ID, which is still rolling out; Aadhaar-based authentication is used at admission in many states.
- **Evidence.** `rollNumber` is the only identifier; `apaarId` is `notNull().unique()` (`src/db/schema.ts:69`) — the strictest possible constraint. No Aadhaar/eKYC, no PRN, no `enrolmentNumber`.
- **Impact.** (a) Real data loads will fail: students without APAAR cannot be inserted. (b) University result ingestion (A5) cannot be joined without a PRN. (c) No APAAR correction/duplicate handling.
- **Fix.** Make `apaarId` nullable (unique partial index), add `prn`, `enrolmentNumber`, `aadhaarVaultRef` (store a vault reference, never the raw number), and a reconciliation queue for APAAR mismatches.

### A3 — Fee heads, quota pricing, instalments, non-gateway collection, receipts, refunds · PARTIAL · S1
- **Requirement.** Indian fees are a menu: tuition (with **government-quota vs management-quota** rates fixed by the state FRC), development/lab/library, **exam fee per paper including arrear papers**, hostel/mess, transport, insurance, refundable caution deposit; collected via UPI **and** DD, cheque, challan (SBI Collect / e-GRAS / BharatKosh), NEFT/RTGS and cash counter with daily scroll; 2–3 instalments, late fee, refunds per UGC/state norms; an **instant numbered money receipt**; no-dues certificate.
- **Evidence.** Schema has `fee_structures` and `payment_transactions` (`src/db/schema.ts:214-236`) but there is **no service** for fee structures, invoices, dues, waivers, refunds, receipts or ledgers in `src/modules/finance/`. The runtime `PaymentTransaction` type (`src/types/index.ts:167-180`) has no receipt number, invoice link, or paid/balance semantics. Only Razorpay/UPI/mandate are supported.
- **Impact.** The ERP cannot answer "what does this student owe, head-wise, and what is pending?" — the most-used screen in any college office. Instalments are a cosmetic string (`mandateCycle = 'SEMESTER_INSTALLMENT_3X'`, `razorpayGateway.ts:42`) with no schedule, due dates or reminders.
- **Fix.** Add `fee_invoices`, `fee_invoice_lines`, `fee_receipts`, `fee_waivers_refunds`, `offline_collections` (DD/challan/cash with instrument no.); a `computeDues(studentId, termId)` service; receipt PDF numbering `INST/FY/SEQ`; FRC rate tables keyed by `quota`.

### A4 — Scholarships, fee concessions, government reimbursement · ABSENT · S1
- **Requirement.** Post-matric SC/ST/OBC, NSP, EBC/EWS, minority, disability (NHFDC), state fee-reimbursement schemes, TFW: sanction lists, DBT disbursement tracking, and "reimbursement pending from government" modelled as a receivable rather than a student due. NAAC Criterion 5.1 depends on it.
- **Evidence.** Only a **hardcoded** figure: `scholarshipBeneficiaryPercentage: 38.4` in the NAAC telemetry (`src/modules/accreditation/naacTelemetry.ts:88`). No scholarship entity, no disbursement ledger, no settlement against invoices.
- **Impact.** Students get double-chased for fees already covered by a scheme, and the institution over-reports NAAC scholarship metrics with invented numbers (see C4).
- **Fix.** `scholarships`, `scholarship_sanctions` (scheme, sanction no., amount, FY), `scholarship_disbursements`, linked to invoice settlement; a scholarship clerk workflow; NAAC 5.1 computed from these tables.

### A5 — University-conducted examination lifecycle · PARTIAL · S1
- **Requirement.** In most Indian colleges the **university conducts exams and publishes results**; the college loads CIA marks, registers candidates (incl. **arrear/backlog papers**), pays examination fees per paper, imports university results, then runs **revaluation / re-totalling / challenge valuation / photocopy-of-script (RTI)** windows, applies **grace-mark** rules and **ATKT** promotions, and handles **malpractice cases under the UGC Unfair Means regulations** with show-cause and committee minutes.
- **Evidence.** Present: `assessments` (CIA/MID_SEM/END_SEM), seating, double-blind OSV, verifiable marksheets. Absent: revaluation/appeal workflow, arrear/supplementary registration, grace-mark/moderation rules, best-of-N CIA aggregation, university result import, unfair-means case entity, examiner remuneration. `CiaGradeEntry` components are free text (`src/db/schema.ts:430-442`).
- **Impact.** The exam section (COE) would still run revaluation, ATKT and malpractice in registers/spreadsheets — the ERP covers maybe 30% of their workload, and it assumes the *college* owns end-semester evaluation (true for autonomous institutes, false for affiliated colleges).
- **Fix.** Add `university_result_batches` + import (CSV/XML per university), `revaluation_requests` (fee + outcome), `backlog_registrations`, `grace_marks_rules`, `malpractice_cases` (show-cause, committee, penalty), and an `institutionType: AFFILIATED | AUTONOMOUS` flag that switches the exam pipeline.

### A6 — Attendance: the 75% rule and its consequences · PARTIAL + 3 defects · S1
- **Requirement.** UGC/state norms bar students below **75%** attendance from end-semester exams; colleges publish subject-wise shortage lists, accept **condonation** (medical/sports/OD) with a fee and Syndicate approval, maintain detention lists, need practical/lab batch attendance, and rely on faculty roll-call as the legal record of instruction.
- **Evidence.** `AttendanceRecord` (`src/types/index.ts:103-114`) and `attendanceService` store raw punches; **nothing computes per-subject attendance percentage** — `arsCalculator` merely *accepts* `attendancePct` as input (`src/modules/early-warning/arsCalculator.ts:9-15`). No shortage/detention report, no condonation entity, no `75%` constant anywhere. Three correctness defects: **C1** (two lectures of a course on one day collapse into one record), **C2** (only 10 of 60 students can scan inside one 10-s window), **C3** (IST day-boundary mis-keying).
- **Impact.** The core compliance output of an Indian attendance system — "eligible / short / detained" per student per subject with audit trail — does not exist. Worse, the marking UX *under*-records attendance (C1/C2), risking wrongful detention: a legal and reputational hazard.
- **Fix.** Add `attendance_sessions` (offering, date, period, faculty, mode) + session records; `computeAttendanceVariance(studentId, termId)` producing per-offering and overall percentages; `condonation_requests` (10–15% shortfall, fee, minutes); an eligibility service consumed by hall-ticket generation; and fix C1/C2/C3.

### A7 — Certificates & student services · ABSENT · S2
- **Requirement.** Bonafide certificate, **Transfer Certificate / College Leaving Certificate**, migration certificate, conduct certificate, medium-of-instruction letter (visa), transcripts (attested), duplicate marksheet, **railway/bus concession forms**, passport NOC, internship NOC, and "no dues" — each with a request workflow, fee, template, sequence number and issue log (Registrar's office).
- **Evidence.** No module, no template, no certificate numbering anywhere in `src/`.
- **Impact.** The Registrar keeps a paper certificate register; students queue physically; nothing is verifiable.
- **Fix.** `certificate_requests` + PDF template renderer + signature/QR verification reusing `verifiableCredentials`; per-college numbering series; SLA dashboard; TC auto-checks no-dues (library A3, hostel A10, fees).

### A8 — Statutory bodies, affidavits & mandated committees · PARTIAL · S2
- **Requirement.** Anti-ragging: committee + squad + **mandatory online affidavits from every student and parent** (antiragging.in) + helpline display; POSH: ICC with an external member, **inquiry to be completed within 90 days**, annual report to the District Officer; UGC (Student Grievances) Regulations 2019: Grievance Redressal Committee, **15-day disposal norm**, Ombudsman; SC/ST cell, OBC cell, Equal Opportunity Cell, anti-discrimination cell; IQAC with minutes and an AQAR calendar.
- **Evidence.** `grievanceService` creates tickets, assigns a committee *name* and an SLA (`src/modules/feedback-grievance/grievanceService.ts:22-43`), but there is no committee entity, membership, tenure, meeting scheduling, minutes, affidavit register or annual-report generator. POSH SLA is 168 h / 7 days with no 90-day statutory milestone, no conciliation stage, no interim relief, and no external-member enforcement. Roles include no Grievance Officer / ICC Chair / IQAC Coordinator / SC-ST Cell Officer.
- **Impact.** Exactly the registers inspectors and NAAC peer teams ask for by name are missing from the system.
- **Fix.** `committees`, `committee_members` (external-member flag + tenure), `meetings`, `minutes`; `ragging_affidavits` (student + parent, with compliance dashboard); POSH case milestones (90-day clock, conciliation, interim relief, annual report export); GRC 15-day clock + Ombudsman escalation; add the missing roles.

### A9 — Accreditation reality: NAAC DVV/AQAR, NBA CO-PO/SAR, NIRF, AISHE · PARTIAL + FABRICATED DATA · S1
- **Requirement.** NAAC requires **evidence documents per metric, DVV responses on the HEI portal and an AQAR every year**; NBA requires **CO-PO attainment** computed from internal/external marks plus an SAR; NIRF has its own template; AISHE is an annual statutory return. Every number must be traceable to source records — DVV officers reject unsupported figures.
- **Evidence.** `naacTelemetryService` emits metrics that are **mostly hardcoded constants**: `feedbackScore: 4.62`, `passPercentage: 94.8`, `publishedPapersScopusWebOfScience: 148`, `citationsCount: 1240`, `libraryDigitalResourcesCount: 18500`, `greenCampusSolarKwhAnnual: 125000`, `femaleStudentRatioPct: 46.2` (`src/modules/accreditation/naacTelemetry.ts:66-99`). `feedbackService` fabricates baselines when there are no responses: `averageLikertScore = 4.5`, `satisfactionPercentage = 90.0` (`src/modules/feedback-grievance/feedbackService.ts:151-159`). `grievanceService.getGrievanceStats()` defaults to `2.1` days (`grievanceService.ts:219-222`). `ssrExporter` renders only 7 rows with no evidence links (`src/modules/accreditation/ssrExporter.ts:31-81`). No NBA CO-PO engine, NIRF template, AISHE return, or research/publication/patent/grant repository exists.
- **Impact.** This is the most dangerous class of finding: a "1-click SSR" producing **plausible but unsupported numbers** exposes the institution to DVV rejection, grade penalties and possible fraud findings. It is worse than having no feature at all.
- **Fix.** (1) Remove every invented default; emit `null`/`INSUFFICIENT_DATA` when source tables are empty. (2) Attach `evidence_record` (source query + record IDs + timestamp) to every cached metric. (3) Build the missing source entities (research publications/grants/patents, placements A10, scholarships A4, feedback responses, faculty FDP). (4) Implement NBA CO-PO attainment from CIA + ESE marks. (5) Add AQAR/AISHE/NIRF exporters. (6) Add an IQAC review-and-approve gate before any export.

### A10 — Hostel/mess, transport, placement & internship, alumni, research/PhD, HR-payroll, workload · ABSENT · S2
- **Requirement.** Warden-run hostels (room allotment, mess billing, night attendance, gate pass/outing, leave-to-parent verification, ragging checks), transport (routes, passes, GPS, billing), Training & Placement Cell (company master, drives, offers, internships + NOC/internship letters, NIRF placement data), alumni registry (NAAC/NIRF alumni data, feedback, contributions), research/PhD management (scholar registration, guides, RAC meetings, publications, grants, patents), HR (UGC 7th-CPC pay scales, CAS promotion, workload norms **UGC 16 h/week, AICTE 1:20 FSR**, FDP records, appraisal/PBAS), and **examination remuneration bills** for paper-setters/evaluators.
- **Evidence.** Warden/TPO share a `WARDEN` role only; no hostel, transport, placement, alumni, research or HR module exists in `src/modules/`. NAAC C3/C5 hardcodes proxies for all of it (`naacTelemetry.ts:78-99`), and C6 `facultyDevelopmentProgramsCompleted: 64` is likewise invented.
- **Impact.** Roughly half of an Indian college's daily operations (hostel, transport, placement, HR, research) live outside the ERP, so any "single source of truth" claim fails, and NAAC/NIRF/AISHE answers have no provenance.
- **Fix.** Ship these as bounded modules in priority order — **Placement+Internship** and **Research/Publications** first (they unlock NAAC C3/C5 and NIRF immediately), then **Hostel/Mess**, then **HR-payroll** (start with workload + FDP + appraisal data, not salary disbursement), then **Transport/Alumni**.

### A11 — University → affiliated-college hierarchy, multi-campus, annual system · ABSENT · S2
- **Requirement.** A university ERP must model **university → affiliated colleges → departments** (with per-college autonomous/affiliated status, own fee rates, own exam ownership), multiple campuses, and institutions still running the **annual (non-semester) system** or a mix.
- **Evidence.** Single flat tenant: no `institutions`/`colleges` table anywhere in `src/db/schema.ts` (tables are `departments`, `programs`, `users`…). `AcademicTerm.semesterType` is `ODD | EVEN | SUMMER` only (`src/types/index.ts:529`).
- **Impact.** The product can serve one autonomous college, not the university or the affiliated-college cluster that actually buys ERP in India; and any annual-pattern programme (some B.Com/B.A. streams, PG diplomas) cannot be modelled.
- **Fix.** `institutions` and `colleges` tables with `institution_type`, per-college settings (fee rates, exam ownership, numbering series, branding); add `ANNUAL` term type and a term-structure flag on `programs`.

### A12 — Data protection (DPDP Act 2023) & Aadhaar handling · ABSENT · S2
- **Requirement.** Verifiable consent with notice (ideally bilingual), **guardian consent for students under 18** (common in first-year cohorts), purpose limitation, retention/erasure schedules, consent withdrawal, breach notification, and a grievance officer; Aadhaar data must be minimised/vaulted (Aadhaar Act restrictions on storage and display).
- **Evidence.** No consent entity, no retention policy, no masking/redaction utilities, no data-principal export/erasure service anywhere in `src/`. Storage is plaintext-ish (`passwordHash` only, `src/db/schema.ts:41`).
- **Impact.** A DPDP-compliant DPO cannot sign off; schools/colleges increasingly require this in tenders.
- **Fix.** `consents` (purpose, version, language, timestamp, guardian flag), `data_retention_policies`, `data_subject_requests` (access/correction/erasure), PII field-level masking, and an audit trail for every PII read.

### A13 — Inbound credit transfer (SWAYAM/NPTEL/other HEIs) · PARTIAL · S3
- **Requirement.** NEP allows credit mobility: students bring credits from **SWAYAM/NPTEL MOOCs and other HEIs via ABC**, and colleges maintain MOUs/credit-transfer approvals.
- **Evidence.** `digiLockerSyncService` only **pushes outbound** credit records (`src/modules/degree-audit/digilockerSync.ts:29-91`); there is no inbound credit-transfer request/approval entity, no MOOC completion ingestion, no MOU register.
- **Fix.** `credit_transfer_requests` (source institution/MOOC, credits, approval workflow, mapped bucket), `moUs` register, and a semester-level "credits from outside" bucket in the degree DAG.

### A14 — Indian academic calendar templates & exam-fee cycles · ABSENT · S3
- **Requirement.** Colleges need ready-made templates: **June–Oct/Nov odd semester, Dec–Apr even**, admission window, internal test weeks, Diwali/Pongal/Onam/state holidays, election duty days, and exam-fee / hall-ticket / result-date cycles that drive student communication.
- **Evidence.** `academicCalendarService` is blank CRUD (`src/modules/academic-calendar/academicCalendarService.ts:37-125`) with no holiday or template library; `TimetableCspSolver.getStandardPeriods()` hardcodes Mon–Fri 09:00–15:00 with 5 periods (`cspSolver.ts:42-58`) — no Saturday, no 8-period day, no shift-based colleges running 07:30–18:00.
- **Fix.** Ship calendar templates per state/university, a holiday importer, and make period grids configurable per college (including 6-day weeks and multi-shift).

---

## 3. User-experience audit

### B1 — There is no user interface to audit · CRITICAL
- **Evidence.** `package.json` declares scripts `dev: next dev`, `build: next build`, but the dependency list is only `crypto`, `drizzle-orm`, `zod` — no `next`, no `react`. `node_modules/next` does not exist (`NEXT_ABSENT`), and `src/` contains only `db/`, `lib/`, `modules/`, `types/` — **no pages, routes, components or styles**. The only "UI" artefacts are: a cache-rule array for `@serwist/next` (`src/modules/pwa/serviceWorkerSpec.ts`), an IndexedDB data packager (`src/modules/pwa/offlineSync.ts`) and a 55-line optimistic-state helper (`src/modules/pwa/optimisticUi.ts`).
- **Impact.** `npm run dev` and `npm run build` cannot work; nothing is clickable; no screen, navigation, form, table or error state exists. Consequently the "sub-150 ms transitions", "offline timetable", "1-tap attendance" and "1-tap UPI" claims in the docs are unverifiable aspirations. Any UX judgement must rest on the service contracts, which is what B2–B12 do.
- **Fix.** Decide the surface explicitly before building: (a) install `next@15` + `react` + Tailwind + shadcn/ui and scaffold App Router routes per role, or (b) declare this repo a backend/service library and add a separate UI package. Either way, add a route map and a component library to CI so `npm run build` is a real gate.

### B2 — Classroom attendance UX will fail in Indian classrooms · CRITICAL
- **Designed behaviour.** Faculty projects a QR that rotates every **10 s** with **zero drift tolerance** (`src/modules/attendance/dynamicQrEngine.ts:19,67`); a student is accepted only if their GPS is within **25 m** and, optionally, WebAuthn-verified (`geofence.ts:50-64`, `attendanceService.ts:54-82`).
- **Measured behaviour (PROBE 1).** Simulating the *best case* of a 60-student class where the queue drains at one student per second against a single 10-second QR step: **marked = 10, rejected = 50**. PROBE 4 confirms a 30-second-old token is rejected outright. In a real 60–120-student Indian lecture, students at the back simply cannot scan in time — attendance defaults to "absent", which cascades into the 75% rule, detention and grievance tickets.
- **Other blockers.** (1) GPS accuracy in concrete/indoor classrooms is typically ±10–40 m, so a 25 m geofence produces both false accepts from the corridor and false rejects from the back bench; GPS also cannot distinguish floors, so a student on the floor above passes. (2) WebAuthn/Face-ID is absent on most sub-₹12k Android devices common in Indian colleges, and `webAuthnService` is a stub anyway (C6). (3) The flow presumes every student has a smartphone **with data** in class; many use shared family phones.
- **Fix.** Raise the QR step to **60–90 s** and add a per-student nonce (anti-replay) so one code can serve a whole class; offer **faculty roll-call / seating-chart tap** as the primary mode with a batch "mark all present, tap the absentees" grid (matches actual practice); treat geofence as an optional signal with an accuracy radius rather than a hard gate; add **offline queue with signed timestamps** for no-network classrooms; add a kiosk mode (faculty tablet at the door).

### B3 — Student/parent channel UX is absent · CRITICAL
- **Evidence.** `NotificationChannel` declares `SMS` (`src/types/index.ts:476`) but `sendNotification()` only writes an in-app row, and `broadcastToCohort()` dispatches only in-app rows + web push (`src/modules/notifications/notificationCenter.ts:43-60,232-257`) — there is **no SMS gateway or WhatsApp provider** anywhere. There is no auth/login service at all (no OTP, no password login, no session), even though `users.passwordHash` exists in the schema. Parent accounts are email-based (`src/lib/db.ts:259-266`), which is unrealistic: Indian parents are reachable on **phone/WhatsApp**, not email.
- **Impact.** Absence alerts, fee dues, exam schedules and result links cannot reach the people who act on them; institutions fall back to WhatsApp groups, defeating the ERP's audit value.
- **Fix.** Phone-first identity: **mobile + OTP login** for students/parents, teacher/parent-friendly **WhatsApp Business templates** (approved utility templates), DLT-registered SMS sender IDs with regional-language templates, and an outbox with delivery/read receipts the office can prove.

### B4 — Language, accessibility and low-bandwidth · ABSENT · S2
- **Evidence.** No i18n library, no translation catalogues, no `lang` handling, no a11y attributes, no dark mode, no font-scaling strategy anywhere in `src/`. All copy is English-only.
- **Impact.** A large share of parents and non-metro students read better in Hindi/regional languages; visually impaired and low-vision users are excluded; text-only 3G browsing is unsupported.
- **Fix.** `next-intl` (or equivalent) with **English + Hindi + at least one regional language per deployment**, a canonical glossary for Indian administrative terms (बोनाफाइड, टीसी, एरियर), WCAG-AA contrast/tap targets/focus order, a "Lite/Text mode" toggle, and a language choice stored on the student record (used for SMS/WhatsApp templates too).

### B5 — IST timezone correctness is broken · CRITICAL
- **Evidence.** Attendance day keys use `new Date(now).toISOString().split('T')[0]` (`src/modules/attendance/attendanceService.ts:85`), as does the ARS `calculationDate` (`src/modules/early-warning/arsCalculator.ts:54`). Nothing in the repo sets `Asia/Kolkata` (no timezone configuration anywhere).
- **Measured behaviour (PROBE 3).** A class at **02:00 IST on 2025-11-03** is keyed as **2025-11-02** — the previous day. Combined with the day-level duplicate check (C1), an early session can be attributed to the wrong day and block or allow the wrong punches. Leave ranges are computed as `new Date('YYYY-MM-DD')` UTC + 86,400,000 ms (`attendanceOverrideService.ts:110-111`), i.e. effectively 05:30 IST, shifting leave boundaries by 5.5 hours.
- **Impact.** Every date-bucketed artefact (attendance %, shortage lists, fee due dates, exam eligibility, ARS history) inherits off-by-one-day errors around IST midnight — precisely during exam/attendance-deadline season.
- **Fix.** Make `Asia/Kolkata` the single institutional timezone: a `toIstDateKey()` helper using `Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata'})`, `zonedTimeToUtc` for date-only inputs, DB timestamps as `timestamptz` (already correct) plus a generated `session_date_ist` column; add regression tests at 00:05, 02:00 and 23:55 IST.

### B6 — Fee-payment UX · ABSENT · S2
- **Evidence.** `createOrder` returns a `upiDeepLink` with placeholder VPA `fees@enterprise-college.edu` (`src/modules/finance/razorpayGateway.ts:40`); there is no receipt PDF, invoice view, dues screen, instalment schedule/reminder, or "payment awaiting verification" state for DD/challan/NEFT; the poller hardcodes `semester: 4` when crediting (`src/modules/finance/autoHealingPoller.ts:60`).
- **Impact.** The two moments that matter most at an Indian fee counter — "show me my dues" and "give me my receipt" — have no UX.
- **Fix.** Dues summary, receipt PDF, WhatsApp receipt share, instalment calendar with reminders, offline-payment intake (DD/challan/NEFT with UTR + maker-checker).

### B7 — Faculty & office data-entry UX · PARTIAL · S2
- **Evidence.** Bulk grade entry exists (`facultyGradebookService.bulkUpsertGrades`, `src/modules/gradebook/facultyGradebookService.ts:73-98`) — good. But there is no Excel/CSV import, no keyboard-first multi-cell grid contract, no cross-section view, and the gradebook lock is an in-memory `Set` (`:21`) lost on restart, never wired to `AcademicTerm.gradeLockDeadline` (the calendar gate `isGradeSubmissionOpen` is not called by the gradebook).
- **Impact.** Faculty re-key marks from Excel into web forms (error-prone), and a restart silently unlocks a gradebook after the deadline.
- **Fix.** CSV/XLSX import with dry-run + error report; keyboard grid (tab/enter/arrows, paste-down-column); server-side lock derived from `gradeLockDeadline` with an audit log on unlock.

### B8 — Exception & appeal UX · ABSENT · S2
- **Evidence.** A rejected check-in (`OUT_OF_BOUNDS`, `EXPIRED_QR_TOKEN`) simply fails (`attendanceService.ts:45-64`); the only recovery path is a faculty/HOD override (`attendanceOverrideService.ts:33-90`). There is no student-facing "report a problem" flow, no staff exception queue, and no show-cause path for unfair-means cases.
- **Impact.** Students with legitimate GPS/multi-floor failures chase staff physically; staff get no consolidated queue, so corrections happen in ad-hoc chats and the audit trail is thin.
- **Fix.** Student "attendance issue" request (auto-attaching device/GPS-accuracy evidence) → faculty exception queue with one-tap approve/reject → override audit log; the same pattern for malpractice show-cause.

### B9 — Offline/PWA privacy on shared phones · RISKY · S2
- **Evidence.** The service-worker spec caches `/api/(grades|finance|fees)` for 24 h (`src/modules/pwa/serviceWorkerSpec.ts:36-42`) and the ID card for 14 days; the ID card embeds name/roll/programme/blood group plus a signature (`offlineSync.ts:40-68`). There is no logout cache-wipe rule, no IndexedDB encryption, and no per-device binding for the cache.
- **Impact.** On a shared family phone (very common), siblings/parents can read another student's grades, dues and ID card from cache; a lost phone leaks signed personal data.
- **Fix.** Encrypt cached PII with a session-derived key, wipe on logout **and** on the next network contact after token expiry, make grades/fees caching opt-in, and require a device PIN before exposing the cached ID card.

### B10 — First-run, empty & error states · ABSENT · S2
- With no UI there is no onboarding, role-based home, empty-state copy, "next action" guidance or offline banner. **Fix:** specify role home screens — Student (today's timetable, per-subject attendance %, dues, pending requests), Parent (ward attendance/dues/results), Faculty (next class, unmarked attendance, pending marks, exception queue), HOD (shortage list, approvals, workload), Registrar (admissions, rosters, certificates, fee reconciliation), COE (exam calendar, seating, evaluation progress, revaluation queue) — and define loading/skeleton/empty/error/offline states in the design system.

### B11 — Shared-device & kiosk realities · ABSENT · S2
- One phone per family, students borrowing phones, and office PCs at 1366×768 with older browsers are the norm. **Fix:** multi-account switch with a short PIN, read-only parent mode, kiosk mode for the fee counter and exam gate (full-screen QR / hall-ticket scanner), and a documented minimum-browser matrix (e.g. Chrome 100+ on Android 8, legacy Chromium for office PCs).

### B12 — Performance & data budgets · ABSENT · S3
- No bundle budget, image/PDF weight policy or offline data budget exists. **Fix:** set and CI-enforce budgets — first load ≤ 250 KB JS (gzip) on 3G, ≤ 2 s TTI on a 2 GB-RAM device, generated PDFs ≤ 200 KB, UPI intent deep-link instead of a hosted checkout page for the common case.

---

## 4. Code-level defects found (independent of the India register)

| ID | Defect | Evidence | Severity |
|---|---|---|---|
| C1 | **Two lectures of the same course on one day collapse into one attendance record.** The second scan returns `success: true` with the *first* record ID and writes nothing. Reproduced: `recordsAdded=1` (expected 2). Breaks double periods, labs and re-scheduled lectures; under-counts attendance toward the 75% rule. | `src/modules/attendance/attendanceService.ts:84-99`; PROBE 2 | S1 |
| C2 | **10-second QR window with 0 drift** makes whole-class marking impossible: 10 of 60 students marked at one student/second; 30-s-old token rejected. | `dynamicQrEngine.ts:19,67`; PROBES 1,4 | S1 |
| C3 | **IST day-boundary mis-keying** via `toISOString().split('T')[0]` (02:00 IST → previous day). | `attendanceService.ts:85`, `arsCalculator.ts:54`; PROBE 3 | S1 |
| C4 | **Fabricated accreditation/feedback defaults** (NAAC 4.62 / 94.8% / 148 papers; feedback 4.5 & 90%; grievance 2.1 days) presented as computed telemetry. | `naacTelemetry.ts:66-99`, `feedbackService.ts:151-159`, `grievanceService.ts:219-222` | S1 |
| C5 | **Auto-healing poller self-credits payments**: with no gateway-lookup callback it *assumes* `status:'paid'` and credits the account, and it hardcodes `semester: 4`. A mis-wired worker marks unpaid students as paid. | `autoHealingPoller.ts:42-63` | S1 |
| C6 | **WebAuthn verification is a stub**: any signature string ≥ 16 chars passes; the counter is bumped without verification and the stored public key is never used. The "anti-proxy biometric" defence is bypassable. | `webauthnService.ts:63-95` | S1 |
| C7 | **LTI 1.3 launch JWT is parsed without signature verification** (base64 payload trusted), so forged launches could inject grades via the sync worker. | `ltiAdvantage.ts:37-56` | S1 |
| C8 | **DigiLocker "digitalSignature" is a plain SHA-256 hash** of a colon-joined string, not a signature; NAD submissions need signed payloads. | `digilockerSync.ts:48-49` | S2 |

| C9 | **RBAC fails open**: any route not matching a rule returns `authorized: true` for every authenticated role. New endpoints are unprotected by default. | `rbacGuard.ts:302-307` | S1 |
| C10 | **`apaarId` NOT NULL + UNIQUE** blocks onboarding of students without APAAR (legacy cohorts, lateral entrants, transfers). | `src/db/schema.ts:69` | S1 |
| C11 | **Gradebook lock lives in a process-local `Set`** — lost on restart, not persisted, not tied to the term deadline. | `facultyGradebookService.ts:21,178-198` | S2 |
| C12 | **Library fine uses a synthetic `feeStructureId` (`'fee-struct-lib-fine'`) against a NOT NULL FK** to `fee_structures`; on real PostgreSQL the insert fails (the in-memory Map hides it). | `libraryService.ts:149-163`, `schema.ts:226` | S2 |
| C13 | **Instalment payments are treated as duplicates**: the idempotency key is `SHA256(studentId:feeStructureId:semester:amount)` cached for 30 days, so a legitimate second instalment of the same amount in the same semester is silently ignored (never credited) — while the code itself markets 3× semester instalments. | `crypto.ts:43-50`, `webhookIdempotency.ts:37-49`, `razorpayGateway.ts:42` | S1 |
| C14 | **Redis seat-counter miss ⇒ "course full"**: if the `course:{id}:seats` key is absent (never seeded, evicted, or after a Redis restart) the Lua path reads 0 and every registration attempt fails with "Course is full. Capacity reached.", with no DB fallback. | `redis.ts:158-167`, `seatEngine.ts:36-46`, `checkoutService.ts:56-60` | S1 |
| C15 | **Auto-heal path can drop a real credit**: the poller calls the webhook handler and then sets `tx.status = 'RECONCILED_BY_POLLER'` regardless of the handler's result; if the idempotency key was already consumed, the credit is discarded while the transaction shows as reconciled. | `autoHealingPoller.ts:53-67`, `webhookIdempotency.ts:42-49` | S2 |

**Reproduction evidence for the behavioural defects** (temporary probe file, deleted after the run):

```
PROBE 1 60-student queue @1 student/sec vs single 10s QR step -> marked=10, rejected=50
PROBE 2 double-lecture same day -> morning.success=true, afternoon.success=true, sameRecord=true, recordsAdded=1 (expected 2)
PROBE 3 class at 02:00 IST on 2025-11-03 is keyed as date=2025-11-02
PROBE 4 30s-old token still valid? false (EXPIRED_QR_TOKEN) ; new token for the 30s step works: true
```

Baseline health (unchanged by this audit): `npm test` → Core unit 17/17, operational gaps 9/9, edge cases 9/9, integration/concurrency 4/4, E2E 11 steps, gap scanner 10/10, total **65 ms**; `npm run typecheck` → clean.

---

## 5. Prioritised remediation roadmap

### P0 — Correctness & trust (before any college demo)
1. **Attendance correctness (C1, C2, C3) + A6.** Introduce `attendance_sessions` (offering, date-IST, period, mode) and mark punches against a session, not a calendar day; accept 60–90 s tokens with a per-student nonce; add `computeAttendanceVariance()` + a 75% shortage/detention report + condonation request.
   *Accept:* two lectures of a course on one IST day produce two records; 60 simulated students scanning within 90 s all succeed; a 02:00 IST session keys to the correct date; a student at 71% appears on the shortage list with the source records.
2. **Money safety (C5, C13, C15, C12).** Require an explicit gateway verification result before crediting; key idempotency on `orderId`/gateway payment ID (not amount), or include an instalment sequence; make the poller status reflect the handler result; drop the synthetic fee-structure ID.
   *Accept:* a second instalment of the same amount credits correctly; a poller run with no gateway data credits nothing; a library fine writes a real `fee_structures` row.
3. **Fail-closed security (C9, C6, C7).** RBAC default-deny with an explicit `public` allow-list; either implement real WebAuthn assertion verification with the stored public key or remove it from the attendance gate; verify LTI JWT signatures against the platform JWKS.
   *Accept:* an unmatched route returns 403 for a student token; a forged 16-char biometric signature is rejected; an unsigned LTI launch is rejected.
4. **Stop fabricating compliance data (C4).** Remove every invented default; return `INSUFFICIENT_DATA` with a reason; attach evidence records to cached metrics.
   *Accept:* with an empty DB, the SSR export contains explicit "no data" rows and no numeric claims.
5. **STOP bootstrap (A2, C10).** `apaarId` nullable + partial unique index; add `prn`/`enrolmentNumber`; extend `student_profiles` with `category`, `gender`, `dob`, `phone`, `quota`, `domicileState`, `isPwD`, `isFirstGraduate` (nullable; validated by category master).
   *Accept:* a student with no APAAR inserts successfully and can be enrolled end-to-end.
6. **IST everywhere (B5).** A single `toIstDateKey()`/`zonedTimeToUtc()` helper used by attendance, ARS, leave, fees and hall tickets; per-module tests at 00:05, 02:00, 23:55 IST.
7. **Surface decision (B1).** Either scaffold Next.js 15 + Tailwind/shadcn with four role homes (Student, Parent, Faculty, Registrar) or formally split this repo into a services package. Add `npm run build` (UI) to CI so it cannot silently break again.

### P1 — Indian core workflows (first paying-college release)
8. **Fees & dues (A3, B6):** fee heads by quota, invoices, dues screen, instalment schedules + reminders, receipts with sequence numbers, DD/challan/cash intake with maker-checker, refunds/waivers with audit.
9. **Scholarships (A4):** schemes, sanctions, disbursements, invoice settlement, NAAC 5.1 from data.
10. **Certificates (A7):** bonafide/TC/LC/migration/conduct/transcript requests with templates, numbering, no-dues orchestration and QR verification.
11. **Exam lifecycle (A5):** revaluation/re-totalling/challenge valuation, arrear registration + exam fees, grace-mark rules, malpractice cases, university result import, `AFFILIATED | AUTONOMOUS` switch.
12. **Statutory registers (A8):** committees/membership/minutes, anti-ragging affidavit register, POSH 90-day milestones + annual report, GRC 15-day clock, IQAC review gate, missing roles (Admission Officer, IQAC Coordinator, Grievance Officer, ICC Chair, SC/ST & OBC cell officers, TPO).
13. **Admissions (A1):** applications, seat matrix by category/quota, merit lists, lateral entry, roster exports.
14. **Channels & language (B3, B4):** mobile-OTP login, DLT-registered SMS + WhatsApp templates in the student's chosen language, delivery receipts; i18n scaffolding with English + Hindi + one regional language.
15. **Accreditation provenance (A9):** evidence links, NAAC AQAR, NBA CO-PO attainment from CIA+ESE, NIRF/AISHE exports.

### P2 — Depth & scale
16. Hostel/mess, transport, placement & internships, research/PhD, alumni, HR/workload (A10) — start with Placement and Research because they unblock NAAC C3/C5 and NIRF.
17. University → affiliated-college hierarchy, multi-campus, annual-system support (A11).
18. DPDP Act 2023 consent/retention/DSAR + Aadhaar vaulting (A12).
19. Inbound credit transfer via ABC + MOOC ingestion + MOU register (A13); Indian calendar/holiday templates and configurable period grids (A14).
20. Shared-device privacy, kiosk modes, performance/data budgets (B9–B12).

### Tests to add alongside (mirrors the existing `gap-scanner` pattern)
- `tests/unit/attendance-sessions.test.ts` — C1/C2 regressions (double lecture, 90-s window, nonce replay).
- `tests/unit/ist-time.test.ts` — B5 boundary cases.
- `tests/unit/rbac-failclosed.test.ts` — C9.
- `tests/unit/fee-instalments.test.ts` — C13/C15.
- `tests/india-compliance-scanner.ts` — asserts the presence of Indian domain entities/fields (category, quota, PRN, invoice, receipt, certificate, revaluation, condonation, committee, affidavit, consent) and fails when one regresses, exactly like `tests/gap-scanner.ts` does for the ten global gaps.

---

## 6. Verification appendix

**Commands run**

| Command | Result |
|---|---|
| `npm test` | PASSED — unit 17/17, operational gaps 9/9, edge cases 9/9, integration 4/4, E2E 11 steps, gap scanner 10/10 (65.08 ms total) |
| `npm run typecheck` (`tsc --noEmit`) | clean, no diagnostics |
| `ls node_modules/next` / `grep '"next"' package.json` | `NEXT_ABSENT` / no dependency — confirms B1 |
| probe script (4 probes, deleted after run) | PROBE 1 `marked=10, rejected=50`; PROBE 2 `recordsAdded=1 (expected 2)`; PROBE 3 `date=2025-11-02` for an IST 02:00 class; PROBE 4 30-s-old token rejected |

**Evidence index (file:line highlights used in this report)**

- Attendance pipeline: `src/modules/attendance/attendanceService.ts:40-123`, `dynamicQrEngine.ts:19-78`, `geofence.ts:50-64`, `webauthnService.ts:25-102`.
- Registrar/identity: `src/types/index.ts:33-46`, `src/db/schema.ts:65-78`.
- Fees/payments: `src/modules/finance/razorpayGateway.ts:31-68`, `webhookIdempotency.ts:33-115`, `autoHealingPoller.ts:22-85`, `src/lib/crypto.ts:43-50`.
- Exams: `src/modules/examination/osvArbitration.ts:54-111`, `seatingOptimizer.ts:79-163`, `verifiableCredentials.ts:20-109`.
- Grievance/statutory: `src/modules/feedback-grievance/grievanceService.ts:20-231`.
- Accreditation: `src/modules/accreditation/naacTelemetry.ts:53-114`, `ssrExporter.ts:27-100`, `src/modules/feedback-grievance/feedbackService.ts:99-213`.
- Registration: `src/modules/registration/*`, `src/lib/redis.ts:144-172`.
- PWA/UX: `src/modules/pwa/serviceWorkerSpec.ts:14-43`, `offlineSync.ts:36-86`, `optimisticUi.ts:14-54`.
- RBAC: `src/modules/rbac/rbacGuard.ts:281-329`.
- LTI: `src/modules/lms/ltiAdvantage.ts:34-66`; DigiLocker: `src/modules/degree-audit/digilockerSync.ts:29-92`.
- Schema/migrations: `src/db/schema.ts`, `src/db/migrations.sql:1-520`.

**Note on the docs.** PRD.md, plan.md and report.md present the platform as architecture-complete with "100% passing" verification; the verification is real **for the service layer**, but the documents describe UI, PWA, offline and accreditation capabilities that are not implemented in code. Treat the PRD's success metrics (sub-150 ms screen transitions, offline timetable, 1-tap UPI) as unverified until B1 is resolved.

### How to read this in one sentence
The service layer is a credible demonstration of *global* ERP failures, but for an Indian college the product is missing its entire front office (admissions, reservations, scholarships, certificates), most of its back office (dues/invoices/receipts, HR, hostel, placement, research), the statutory registers that inspectors and NAAC ask for — and, literally, every screen; meanwhile three reproduced defects (day-collapsing attendance, 10-second QR, IST mis-keying) would cause *wrong* attendance and fee outcomes on day one, which must be fixed before any display of the "anti-proxy" and "1-click SSR" claims in front of an Indian institution.

