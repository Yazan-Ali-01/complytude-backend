# Complytude — Launch Playbook

> **The single source of truth for "what do I do next?"**
>
> Last updated: 2026-04-30 (Yazan)
> Status: Pre-launch · Backend ~95% feature-complete · Frontend in separate repo · 0 paying customers
>
> When you come back to this project after time away, **read this file first**. Notion is stale. Linear has the work; this file has the sequence.

---

## How to use this doc

1. **Open this file. Find the first phase that isn't done. Do that.**
2. Don't skip phases. Each one removes a launch blocker the next one assumes is solved.
3. Update the checkboxes as you complete things. Update the "Last updated" line.
4. If reality changes the priority, **update this file before you start working** — never let it drift.
5. Each phase has a **Done when** section. If you can't tick every box, you're not done with that phase.

---

## Current state snapshot (2026-04-30)

### What is shipped and works

- **Backend monorepo**: `apps/api`, `apps/worker-ai`, `apps/worker-ingestion`, `apps/worker-generation`
- **Auth**: dual-token JWT, Redis sessions, Google + Microsoft SSO, email verification
- **Tenancy**: PostgreSQL RLS, tenant context middleware, platform vs tenant RBAC
- **Entitlements**: plan-based feature flags, quota enforcement, usage ledger, credit system, **trial flow**
- **Billing**: Stripe customers + subscriptions + webhooks, entitlement projection on subscription events
- **RAG analysis**: hybrid search (vector + BM25 + RRF), every required clause checked, scoped-by-ruleset retrieval
- **Document generation**: docxtemplater + Gotenberg PDF, async job + polling
- **Audit + observability**: opt-in `@Audit()` decorator, Pino structured logs, trace IDs
- **Infrastructure**: Terraform modules, ECS Fargate, RDS, ElastiCache, S3, deployed staging
- **CI/CD**: GitHub Actions, lint + type-check + tests, husky + commitlint hooks

### What is NOT shipped (and is in your way)

- **Real UAE rulesets in DB.** You have `data/rulesets/dmcc_company_regulations.json` committed but not ingested in staging.
- **Real templates in DB.** A few seeded test templates exist; not the actual contracts customers want.
- **PII redaction.** Audit logs and analysis prompts can leak PII today. UAE PDPL exposure.
- **Pre-launch security hardening.** Per-tenant rate limits, security headers, secret rotation runbook.
- **Pricing truth.** Notion says one thing, code says another. No marketing site reflects either.
- **Stripe dunning.** Past-due / failed-payment access policy unimplemented (`COM-156`).
- **Frontend.** Separate repo, but it's the choke point. No customer can use the system without it.
- **End-to-end proof.** Nobody has walked the full revenue path (signup → pay → analyze → generate) on staging.
- **Real-time alerting.** Logs exist; nobody is watching them.

### Should you do the frontend yourself?

**Yes.** You've shipped enough backend that adding more without a UI is wasted motion. The frontend is now the critical path.

Scope it tight: shadcn/ui + Next.js App Router + Tailwind, plug into your existing API. Don't build a design system. Don't pixel-perfect anything. Ship 10 screens that work.

---

## The sequence

| Phase | Goal                                              | Time      | Side    | Status |
| ----- | ------------------------------------------------- | --------- | ------- | ------ |
| 0     | Prove the revenue path on staging                 | 1 week    | BE only | ☐      |
| 1     | Real rulesets + 3 real templates                  | 1.5 weeks | BE      | ☐      |
| 2     | PII redaction + security hardening                | 1 week    | BE      | ☐      |
| 3     | Pricing truth + frontend MVP scope                | 1 week    | BE + FE | ☐      |
| 4     | Frontend MVP (10 screens)                         | 3 weeks   | FE      | ☐      |
| 5     | Closed beta + observability hookup                | 2 weeks   | BE + FE | ☐      |
| 6     | Public launch (landing page + open signups)       | 1 week    | FE      | ☐      |
| 7     | Post-launch polish (Tier 2 projects)              | 4 weeks   | BE + FE | ☐      |
| 8     | Differentiators (Tier 3 projects, after PMF)      | open      | BE + FE | ☐      |

**Total to public launch: ~10 weeks (~70 days).** Aggressive but doable solo if you don't get distracted by Tier 3 work.

---

## Phase 0 — Prove the revenue path on staging (this week)

**Goal:** End the question "does this product actually work end-to-end?" before doing anything else.

### Tasks

- [ ] Drop obsolete stash + branch:
  ```bash
  git stash drop stash@{2}
  git branch -D feature/com-200-trial-subscription-flow
  git push origin --delete feature/com-200-trial-subscription-flow
  ```
- [ ] Spin up staging. Walk through as a brand-new user, **using the API directly via Postman/curl**:
  - Signup → email verify → tenant created
  - Login (record both tokens)
  - Subscribe to a paid plan with a Stripe test card
  - Verify entitlements applied (check `entitlement_snapshots` row)
  - Upload a real DMCC contract (use one of `data/test-documents/*`)
  - Trigger analysis → poll the job → verify results returned
  - Generate a document from a template → poll → download the PDF
  - Hit a quota cap → confirm 402, then upgrade and confirm success
  - Trigger Stripe webhook for `customer.subscription.deleted` → verify entitlement revoked
- [ ] Track every gap in a new file: `docs/LAUNCH_GAPS.md`. For each gap: what broke, severity (blocker / fixme / nice-to-have), Linear issue link if you create one.
- [ ] Triage Friday: pick the **top 3 launch-blocking gaps** found this week. Create concrete tickets only for those.

### Done when

- [ ] You have personally completed the entire signup → pay → upload → analyze → generate → download flow on staging without manual intervention or DB pokes.
- [ ] `docs/LAUNCH_GAPS.md` exists with all observed gaps logged.
- [ ] Top 3 gaps have Linear tickets under the right project.
- [ ] You can answer "would a customer who signed up right now succeed?" with a one-paragraph honest answer.

### Linear projects involved

- `AWS Infrastructure & Deployment` (existing, In Progress) — issue [COM-194](https://linear.app/complytude/issue/COM-194) is the catch-all
- `End-to-End Test Coverage for Revenue Paths` (Tier 1, Backlog)

---

## Phase 1 — Real rulesets + 3 real templates (week 2–3)

**Goal:** Stop demoing dummy data. Ship one real authority's compliance content end-to-end.

### Tasks

- [ ] Ingest `data/rulesets/dmcc_company_regulations.json` into staging DB via the existing ingestion worker. Verify it shows up in `rulesets` and `ruleset_chunks`.
- [ ] Run RAG retrieval against the test contract `data/test-documents/dmcc_test_shareholders_agreement.docx`. Manually validate the top 5 retrieved chunks are actually relevant (this is your sanity check that the pipeline is working with real content).
- [ ] Tune `RAG_TOP_K_PER_QUERY`, `RAG_OPTIONAL_CLAUSE_LIMIT` for DMCC content quality. Document chosen values.
- [ ] Pick the **3 most-requested templates for DMCC tenants** (lawyer feedback, gut call, or just: Employment Contract, MOA, Board Resolution). Create real DOCX templates with proper variables.
- [ ] Seed those 3 templates in staging via existing template-seed scripts.
- [ ] Generate one real DMCC employment contract end-to-end on staging. Have a UAE lawyer eyeball the output.
- [ ] Document the ruleset ingestion runbook in `docs/RULESET_INGESTION.md` (how to add a new authority's ruleset).

### Done when

- [ ] DMCC ruleset live in staging; analysis returns relevant compliance findings against a real test contract.
- [ ] 3 real DMCC templates live in staging; you can generate each as a PDF.
- [ ] One human (you or a contractor lawyer) has reviewed both the analysis output and at least one generated document and confirmed they're not embarrassing.

### Linear projects involved

- `Real Ruleset Library & Authority Coverage` (Tier 1, Urgent)
- `Document Generation from Templates` (existing, In Progress — verification only; code is done)

---

## Phase 2 — PII redaction + security hardening (week 4)

**Goal:** Stop bleeding PII into logs and prompts. Lock down the perimeter before letting strangers in.

### Tasks

- [ ] Audit current PII flow:
  - What's logged to Pino at `info`/`error` levels in API + workers?
  - What's sent to OpenAI in analysis prompts? (full document content, including names/IDs/salaries today)
  - What's stored in `audit_logs.metadata`?
- [ ] Implement the redaction layer on three boundaries:
  1. **Pino redaction config** — names, emails, phone numbers, Emirates IDs, IBAN, salaries
  2. **Pre-LLM masking** — replace PII with placeholders before prompt construction; restore in displayed results
  3. **Audit log scrubbing** — `auditService` strips PII fields before persist
- [ ] Add per-tenant rate limits (Redis-backed sliding window):
  - Auth: 10/minute
  - Document upload: 30/hour
  - Analysis: per plan quota (already enforced; double up at HTTP layer)
- [ ] Add security headers via Fastify hooks: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- [ ] Document a secret rotation runbook in `docs/RUNBOOKS/SECRET_ROTATION.md` (DB password, JWT secret, OpenAI key, Stripe key, S3 keys).
- [ ] Run `npm audit --production` on all apps; resolve high/critical only.

### Done when

- [ ] No PII appears in `kubectl logs` (or CloudWatch equivalent) when you run a real analysis.
- [ ] LLM prompts contain placeholders (`[NAME_1]`, `[SALARY_1]`), not real values.
- [ ] Audit log entries for sensitive operations contain hashed/masked metadata, not raw PII.
- [ ] Rate limits return 429 when you hammer endpoints.
- [ ] Security headers visible in `curl -I https://api.staging.complytude.com/health`.
- [ ] Secret rotation runbook exists and you've actually rotated one secret as a dry run.

### Linear projects involved

- `PII Redaction & PDPL Compliance Layer` (Tier 1, Urgent)
- `Pre-Launch Security Hardening` (Tier 1, Urgent)

---

## Phase 3 — Pricing truth + frontend MVP scope (week 5)

**Goal:** Lock pricing in one place. Plan the frontend so you don't flounder.

### Tasks

#### Pricing & docs

- [ ] Decide final pricing. **Three plans, one number each, written here:**
  - Essential: $___ /month
  - Strategist: $___ /month
  - Enterprise: contact sales
- [ ] Make the code match: `apps/api/src/modules/entitlements/data/plans.ts` (or wherever plans are seeded). Stripe products & prices created in Stripe dashboard with the same numbers.
- [ ] Kill or update these stale Notion docs (delete or stamp "DEPRECATED" header):
  - `07_Tech_Architecture`
  - `08_Product_Requirements_Document`
  - `12_Feature_Documentation_v2`
  - `Product Roadmap`
  - `Strategic Product Architecture: AI-Native Legal Infrastructure for the UAE Market` (the parts about bilingual editor + voice)
- [ ] Fix the merge conflict marker still sitting in `docs/README.md` line 99-102.
- [ ] Update `README.md` with current accurate feature list.

#### Frontend scope (lock it down before writing code)

- [ ] Create the FE repo's own playbook (or use this section as gospel). The MVP is **exactly these 10 screens**:
  1. Landing / marketing (single page, simple)
  2. Signup
  3. Email verification (gate after signup)
  4. Login
  5. Onboarding (pick authority/persona — one screen, three options)
  6. Plan picker → Stripe Checkout redirect
  7. Dashboard (list docs + generation jobs)
  8. Upload contract + trigger analysis
  9. Analysis results view
  10. Generate from template wizard + download
- [ ] **NOT in MVP**: bilingual editor, persona deep-onboarding, in-app chat support, advanced template editor, voice input, document comparison. Move to Phase 7.
- [ ] Set up the FE repo with shadcn/ui + Next.js App Router + Tailwind + auth library (Clerk or your own JWT integration). Pick today, don't shop.
- [ ] Generate API client types from the existing OpenAPI/Swagger spec in `apps/api`.

### Done when

- [ ] One pricing number per plan, identical in: code (`plans.ts`), Stripe dashboard, this playbook, your landing page draft.
- [ ] The 5 stale Notion docs are deprecated or rewritten.
- [ ] FE repo is bootstrapped with auth, routing, API client, and a placeholder for each of the 10 screens.

### Linear projects involved

- `Documentation & Pricing Truth Cleanup` (Tier 1, Urgent)
- `Landing Page` (existing, frontend repo)

---

## Phase 4 — Frontend MVP build (weeks 6–8)

**Goal:** Ship the 10 screens. No more, no less.

### Suggested order (each ~2-3 days for a solo full-stack dev)

- [ ] Screens 1-2: Landing + signup
- [ ] Screens 3-4: Email verify + login (talk to existing auth endpoints)
- [ ] Screen 5: Onboarding picker
- [ ] Screen 6: Plan picker → Stripe Checkout (use Stripe Checkout, not Payment Element — it's faster)
- [ ] Screen 7: Dashboard (list documents, list generation jobs, plan/usage card)
- [ ] Screens 8-9: Upload + analysis flow with polling UI
- [ ] Screen 10: Template generation wizard

### Engineering rules for this phase

- [ ] **No new backend features** unless a screen literally cannot be built without it.
- [ ] **No design polishing.** Defaults. If shadcn ships it, ship it.
- [ ] **No A/B testing infra, no analytics deep-dive.** Plausible or Vercel Analytics, copy-paste, done.
- [ ] **Polling, not websockets.** Backend already returns `Retry-After`; respect it.
- [ ] Deploy each screen to a preview URL the moment it builds. Use Vercel Preview Deployments.

### Done when

- [ ] All 10 screens deployed to a staging frontend domain (e.g., `app.staging.complytude.com`).
- [ ] You can complete the full revenue path through the UI alone — no curl, no Postman, no DB pokes.
- [ ] Mobile is "doesn't break", not "looks great". Tablet+ is the target.

### Linear projects involved

- (FE repo Linear project — create a mirror "Frontend MVP" project there if you haven't)
- Reads from: `Onboarding Persona Selection Flow` (Tier 2 — but only the picker part, not the full flow)

---

## Phase 5 — Closed beta + observability hookup (weeks 9–10)

**Goal:** Let 5–10 real humans use it. Watch what breaks.

### Tasks

- [ ] Set up alerting (Datadog, Sentry, or BetterStack — pick one, don't shop):
  - 5xx rate > 1% over 5 min
  - Worker job failure rate > 5%
  - Stripe webhook handler failures
  - Database connection pool > 80%
  - Redis connection failures
- [ ] Set up Sentry on both backend and frontend.
- [ ] Wire `nestjs-i18n` for English error messages (Arabic can wait until Phase 7).
- [ ] Recruit 5–10 beta users. Give them a private invite code.
- [ ] Monitor logs **daily** for 2 weeks. Fix what breaks. Don't add features.
- [ ] Hold a 30-min interview with each beta user after week 1. Take notes; do not act on every request.

### Done when

- [ ] Alerts are firing where they should and silent where they shouldn't.
- [ ] At least 5 beta users have completed end-to-end without your intervention.
- [ ] You have a written list of the top 5 "this is actually broken" items vs the top 5 "this is a feature ask we'll do later" items.
- [ ] Stripe dunning flow (`COM-156`) is implemented (you'll have hit at least one failed-payment situation by now).

### Linear projects involved

- `Observability, Alerting & SLOs` (Tier 2, High)
- `Notification & Email Infrastructure` (Tier 2, High) — for transactional emails (welcome, payment receipts, analysis-complete)
- `Stripe Payment Integration` → `COM-156` dunning

---

## Phase 6 — Public launch (week 11)

**Goal:** Open the door.

### Tasks

- [ ] Polish landing page based on beta feedback. Real customer quote helps.
- [ ] Set up a status page (BetterStack/Statuspage free tier).
- [ ] Document your incident response runbook in `docs/RUNBOOKS/INCIDENT_RESPONSE.md`. Don't make it fancy: who to wake up, where logs live, how to roll back.
- [ ] Tag a v1.0.0 release on `development` → promote to `main`.
- [ ] Open public signups. Disable invite-only mode.
- [ ] Announce on whatever channels you have (LinkedIn, X, UAE legal communities). Soft launch is fine.

### Done when

- [ ] Public signups are open.
- [ ] Status page is live and linked from the app.
- [ ] You have written down what to do when (not if) production breaks at 2am.

### Linear projects involved

- `Marketing Site & Landing Pages` (Tier 4)
- `Customer Success Operations` (Tier 4) — at least the basics: support email, response SLA

---

## Phase 7 — Post-launch polish (months 3–4)

**Goal:** Make the product not embarrassing on the dimensions that matter to retention.

Pick from this list **only as customer feedback dictates**, not because the playbook says so:

- [ ] **Bilingual document generation** — if customers want Arabic outputs (`Bilingual Document Generation`, Tier 2)
- [ ] **More authority rulesets** — IFZA, DED, RAKEZ, ADGM, DIFC (`Real Ruleset Library` continued)
- [ ] **More templates** — beyond the 3 MVP templates
- [ ] **Onboarding persona flow** — full version with per-persona dashboards (`Onboarding Persona Selection Flow`)
- [ ] **Tenant lifecycle admin console** — your internal tool for support (`Tenant Lifecycle Operations & Admin Console`)
- [ ] **Compliance checklists** — workflow guidance per authority (`Compliance Checklists & Workflows`)
- [ ] **Stripe lifecycle polish** — proration, plan switching UX (`Subscription Lifecycle Operations Polish`)

### Done when

- [ ] You have <5% monthly churn or you know exactly why you don't.
- [ ] You're getting referrals.
- [ ] At least one of the above items shipped because customers asked for it, not because you assumed.

---

## Phase 8 — Differentiators (after PMF)

Don't touch these until you have product-market fit signal (paid users, retention, referrals).

- [ ] **AI Agent / Conversational Copilot** (Tier 3)
- [ ] **Document Comparison & Diff Engine** (Tier 3)
- [ ] **Synchronized Bilingual Editor** (Tier 3) — the Notion fantasy feature
- [ ] **Voice Input & Voice-to-Document** (Tier 3)
- [ ] **AI-Powered Form Filling** (Tier 3)
- [ ] **UAE Authority API Integration Adapters** (Tier 4) — only when there's actual demand for direct authority submission

These move the needle from "useful" to "this is the future of UAE legal tech". They don't move you from "nothing" to "useful". Do them after you're alive, not before.

---

## Weekly cadence

Every **Monday morning, 30 minutes:**

1. Open this file.
2. Check the current phase. Are you on track?
3. Update checkboxes. Move "Status" column.
4. If reality shifted priorities, edit this file **before** you start coding. The playbook drives Linear, not the other way around.
5. Commit changes: `docs(playbook): week N update`.

Every **Friday, 30 minutes:**

1. Skim Linear backlog. Anything older than 60 days that you haven't touched? Cancel it (use the same logic from the recent cleanup).
2. Look at staging logs. Anything weird?
3. If you broke a ticket into smaller pieces this week, link them to the parent project.

---

## Things to NOT do (anti-patterns)

You have a documented track record (in canceled Linear issues) of these traps. Resist:

- ❌ **Don't add entitlement caching layers** before you have customers (`COM-126/127/128` — kept but parked).
- ❌ **Don't chase architectural perfection** on rulesets/templates (`COM-38/55/56/57`). Ship the common case.
- ❌ **Don't refactor for "cleanliness"** during the launch sprint (`COM-163/164`). Ugly working code > clean broken code.
- ❌ **Don't build observability you don't watch.** Datadog dashboards nobody opens are debt.
- ❌ **Don't add a feature because Notion says you should.** Notion is wrong; this file is right.
- ❌ **Don't open a new Linear project mid-phase.** Finish what you started.
- ❌ **Don't write tests retroactively** for features you haven't shipped to a real user yet. E2E tests in Phase 5 are the contract; unit tests come along organically.

---

## Linear project map

Active backend projects → which phase they belong to:

| Linear Project                                         | Tier | Phase |
| ------------------------------------------------------ | ---- | ----- |
| AWS Infrastructure & Deployment                        | —    | 0     |
| End-to-End Test Coverage for Revenue Paths             | 1    | 0, 5  |
| Real Ruleset Library & Authority Coverage              | 1    | 1, 7  |
| Document Generation from Templates (verification only) | —    | 1     |
| PII Redaction & PDPL Compliance Layer                  | 1    | 2     |
| Pre-Launch Security Hardening                          | 1    | 2     |
| Documentation & Pricing Truth Cleanup                  | 1    | 3     |
| Stripe Payment Integration (`COM-156` dunning only)    | —    | 5     |
| Observability, Alerting & SLOs                         | 2    | 5     |
| Notification & Email Infrastructure                    | 2    | 5     |
| Marketing Site & Landing Pages                         | 4    | 6     |
| Customer Success Operations                            | 4    | 6     |
| Bilingual Document Generation                          | 2    | 7     |
| Onboarding Persona Selection Flow                      | 2    | 7     |
| Tenant Lifecycle Operations & Admin Console            | 2    | 7     |
| Compliance Checklists & Workflows                      | 2    | 7     |
| Subscription Lifecycle Operations Polish               | 4    | 7     |
| AI Agent / Conversational Copilot                      | 3    | 8     |
| Document Comparison & Diff Engine                      | 3    | 8     |
| Synchronized Bilingual Editor                          | 3    | 8     |
| Voice Input & Voice-to-Document                        | 3    | 8     |
| AI-Powered Form Filling                                | 3    | 8     |
| UAE Authority API Integration Adapters                 | 4    | 8     |
| Landing Page (frontend repo)                           | —    | 3, 6  |

---

## Quick links

- [README.md](../README.md) — project overview
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design
- [DATABASE.md](DATABASE.md) — schema + RLS
- [ENTITLEMENTS.md](ENTITLEMENTS.md) — plan/quota/credit system
- [billing/](billing/) — Stripe operations
- [DEPLOYMENT.md](DEPLOYMENT.md) — deploy runbook
- Linear: [`ComplyTude-BE` workspace](https://linear.app/complytude)

---

## Change log

| Date       | Author | Change                                                                          |
| ---------- | ------ | ------------------------------------------------------------------------------- |
| 2026-04-30 | Yazan  | Initial playbook. 50 stale Linear issues cancelled. 20 high-level projects set. |
