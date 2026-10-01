---
name: Real RAG Data Plan
overview: A concrete guide for sourcing real UAE freezone regulations (DMCC, DIFC, ADGM), structuring them into the exact format the existing pipeline expects, and creating real DOCX contract templates — all manually curated, ingested via the existing API.
todos:
  - id: source-dmcc-regs
    content: Download DMCC regulation PDFs from dmcc.ae/regulations
    status: pending
  - id: source-difc-regs
    content: Download DIFC laws from difc.ae legal database (Employment Law No. 2/2019, Companies Law No. 5/2018, Data Protection Law No. 5/2020)
    status: pending
  - id: source-adgm-regs
    content: Download ADGM regulations from en.adgm.thomsonreuters.com (Employment 2019, Companies 2020, Data Protection 2021)
    status: pending
  - id: structure-clauses
    content: Structure regulation text into clause JSON files matching CreateRulesetDto format (id, title, content, order, is_required, metadata with article/severity)
    status: pending
  - id: ingest-rulesets
    content: Ingest rulesets via POST /rulesets API (or update seed SQL) — this auto-triggers chunking + embedding
    status: pending
  - id: verify-rag
    content: 'Verify RAG pipeline: run a compliance analysis on a sample contract against real rulesets'
    status: pending
  - id: create-docx-templates
    content: Create 3 employment contract DOCX templates (DMCC, DIFC, ADGM) with {{placeholder}} variables
    status: pending
  - id: upload-templates
    content: Upload templates via POST /templates with field definitions and ruleset_keys linking
    status: pending
  - id: verify-generation
    content: 'Verify end-to-end: generate a document from template, then run compliance analysis on it'
    status: pending
isProject: false
---

# Real RAG Data and DOCX Templates Plan

## Current State

Your full pipeline is already built and operational:

- **Rulesets**: `POST /rulesets` with clauses -> auto-enqueues ingestion -> `worker-ingestion` chunks + embeds via OpenAI -> stored in `ruleset_chunks` -> hybrid search (pgvector + BM25 + RRF) -> GPT-4o-mini analysis
- **Templates**: `POST /templates` (multipart with DOCX file) -> stored in S3 -> `worker-generation` renders variables into DOCX -> Gotenberg converts to PDF
- **5 synthetic rulesets** exist as seed data; **5 synthetic templates** with no real DOCX files
- **10 authorities** already seeded (including DMCC, DIFC, ADGM)

What's missing is **real content**. No code changes are needed.

---

## Part 1: Real Regulation Rulesets (RAG Data)

### Exact Format Required

Each ruleset is created via `POST /rulesets` (requires `rulesets:manage` platform permission, identity token). The body:

```json
{
  "key": "dmcc_employment_regulations_2024",
  "name": "DMCC Employment Regulations 2024",
  "description": "Official DMCC free zone employment rules...",
  "authority_id": "<UUID of DMCC authority from DB>",
  "clauses": [
    {
      "id": "dmcc_emp_01",
      "title": "Employment Contract Requirements",
      "content": "Full regulation text here. Verbatim or close paraphrase of the actual regulation article. Include all details, exceptions, and conditions.",
      "order": 1,
      "is_required": true,
      "metadata": {
        "article": "Art. 5.1",
        "severity": "critical",
        "section": "Employment Terms",
        "source_document": "DMCC Company Regulations v14"
      }
    }
  ],
  "metadata": {
    "source": "DMCC Company Regulations v14",
    "effective_date": "2024-01-01",
    "tags": ["employment", "dmcc", "free-zone"]
  }
}
```

**Clause guidelines** (these affect RAG quality directly):

- `content`: Should be 1-3 paragraphs per clause. Too short = poor context for embeddings. Too long = gets chunked and may lose coherence. The sweet spot from `libs/embedding/src/embedding.constants.ts` is ~500-1500 tokens per clause.
- `id`: Use a namespaced pattern like `dmcc_emp_01`, `difc_comp_03`
- `metadata.severity`: Use `critical` / `high` / `medium` / `low` — the analysis prompt builder uses this for prioritization
- `metadata.article`: Reference the source article/section number from the regulation
- `is_required`: Set `true` for mandatory compliance rules, `false` for optional/recommended ones

### Where to Source Regulations

#### DMCC (Dubai Multi Commodities Centre)

**What to download:**

- **DMCC Company Regulations** — the primary regulation document covering company formation, governance, and operations
- **DMCC Authority Regulations** — licensing, compliance, penalties
- **Member Directives** — binding operational rules (less publicly available)

**Where:**

- `https://www.dmcc.ae/regulations` — regulations page with downloadable PDFs
- `https://www.dmcc.ae/business-setup` — may have supplementary rules
- The "DMCC Rules and Regulations" consolidated document is typically a single PDF covering both company and employment rules

**Regulation categories to extract for DMCC:**

| Category          | What to look for                                                                        |
| ----------------- | --------------------------------------------------------------------------------------- |
| Employment        | Contract requirements, visa/sponsorship rules, termination, medical insurance, gratuity |
| Company formation | Licensing types, share capital, director requirements, beneficial ownership             |
| Commercial        | Contract language, arbitration clauses, DMCC arbitration centre rules                   |
| AML/KYC           | Member compliance obligations, reporting                                                |

#### DIFC (Dubai International Financial Centre)

**What to download:**

- **DIFC Employment Law No. 2 of 2019** (as amended)
- **DIFC Companies Law No. 5 of 2018** (as amended)
- **DIFC Data Protection Law No. 5 of 2020**
- **DIFC Contract Law No. 6 of 2004** (DIFC has its own contract law)
- **DIFC Insolvency Law**
- **DFSA Rulebook** (if covering financial services)

**Where:**

- `https://www.difc.ae/laws-regulations/legal-database` — browse by law number, download PDFs
- `https://dfsaen.thomsonreuters.com/` — DFSA rulebook in structured HTML (financial services specific). Note: `/entiresection/<id>` URLs give bulk HTML per instrument. ToS may restrict automated scraping — manual download is fine.

**Key advantage:** DIFC laws are modeled on English common law and are very cleanly structured with numbered articles — easiest to convert to clauses.

#### ADGM (Abu Dhabi Global Market)

**What to download:**

- **ADGM Employment Regulations 2019** (as amended)
- **ADGM Companies Regulations 2020**
- **ADGM Data Protection Regulations 2021**
- **ADGM Founding Law** (Federal Decree No. 15 of 2013)
- **FSRA Rules** (if covering financial services)

**Where:**

- `https://en.adgm.thomsonreuters.com/` — the working portal (note: `legislation.adgm.com` was returning 503 as of April 2026)
- Navigate: **ADGM Legal Framework** > **Commercial Legislation** for company/employment regs
- Each regulation is available as clean HTML at `/node/<id>` URLs, and bulk HTML at `/entiresection/<id>`
- Some documents also have PDF versions

### Recommended Ruleset Structure per Authority

For each of the 3 authorities, create rulesets organized by **regulatory domain** (not one giant ruleset):

**DMCC** (3-4 rulesets):

- `dmcc_employment_regulations` — employment-specific rules
- `dmcc_company_regulations` — company formation, governance, licensing
- `dmcc_compliance_regulations` — AML/KYC, reporting, penalties

**DIFC** (4-5 rulesets):

- `difc_employment_law` — DIFC Law No. 2 of 2019
- `difc_companies_law` — DIFC Law No. 5 of 2018
- `difc_data_protection_law` — DIFC Law No. 5 of 2020
- `difc_contract_law` — DIFC Law No. 6 of 2004
- `difc_dfsa_rulebook` (optional, financial services only)

**ADGM** (4-5 rulesets):

- `adgm_employment_regulations` — ADGM Employment Regulations 2019
- `adgm_companies_regulations` — ADGM Companies Regulations 2020
- `adgm_data_protection_regulations` — ADGM Data Protection Regulations 2021
- `adgm_commercial_regulations` — general commercial rules
- `adgm_fsra_rules` (optional, financial services only)

### Ingestion Method

**Option A (Recommended for pre-production): Seed SQL**

Replace the synthetic data in [scripts/seeds/009_seed_rulesets.sql](scripts/seeds/009_seed_rulesets.sql) and [scripts/seeds/010_seed_ruleset_chunks.sql](scripts/seeds/010_seed_ruleset_chunks.sql) with real data. Then run:

```bash
docker-compose down -v
docker-compose up -d postgres redis
pnpm db:migrate
pnpm db:seed
# Start worker-ingestion to process the embedding jobs
pnpm start:dev worker-ingestion
```

Note: If you use seed SQL, the `ruleset_chunks` + embeddings will NOT be auto-generated — you would need to either:

1. Also seed `010_seed_ruleset_chunks.sql` with pre-computed embeddings (complex), OR
2. After seeding, trigger ingestion via `POST /rulesets/:key/ingest` for each ruleset (simpler)

**Option B: API ingestion**

Use the API directly (requires running API + worker-ingestion + Redis):

1. `POST /rulesets` for each ruleset — this auto-enqueues ingestion
2. Chunks + embeddings are generated automatically by `worker-ingestion`
3. No seed file changes needed

This is cleaner because the ingestion pipeline handles chunking and embedding for you.

**My recommendation:** Use **Option B (API)** for the initial load. Write a simple script that reads your structured JSON files and POSTs them to the rulesets API. Then update the seed files later for reproducibility.

### Practical Workflow for Structuring a Regulation PDF

1. Download the PDF (e.g., "DMCC Company Regulations v14")
2. Open in a PDF reader or paste into a text editor
3. For each article/section that contains a compliance rule:

- Extract the article number -> `metadata.article`
- Extract the section heading -> `title`
- Extract the full article text -> `content`
- Assign severity based on penalty/importance -> `metadata.severity`
- Number sequentially -> `order`
- Determine if mandatory compliance -> `is_required`

1. Save as a JSON file matching the `CreateRulesetDto` shape
2. POST to `/rulesets`

**Pro tip:** You can use ChatGPT/Claude to help structure a regulation PDF into the clause JSON format. Paste the regulation text and ask it to output in the exact clause format above. Then do a QA pass to verify accuracy.

---

## Part 2: Real DOCX Contract Templates

### How Templates Work in Your System

1. You create a DOCX file with `{{variable_name}}` placeholders (Docx-Templater syntax)
2. Upload via `POST /templates` (multipart form) with field definitions
3. When a user generates a document, the system extracts placeholders from the DOCX, validates against field definitions, substitutes variables, and converts to PDF via Gotenberg

### DOCX Placeholder Format

Your system uses [docx-templater](https://docxtemplater.com/) via `libs/docx-renderer/`. Placeholders in the DOCX are:

- Simple: `{{employee_name}}`, `{{company_name}}`, `{{start_date}}`
- System variables are also injected (see `getGenerationContext` in [document-preview.service.ts](apps/api/src/modules/documents/services/document-preview.service.ts)): `{{current_date}}`, `{{tenant_name}}`, etc.

### What Templates to Create (Priority Order)

For each authority, start with the highest-demand contract types:

**Tier 1 — Employment (all 3 authorities):**

- `dmcc_employment_contract_en` — DMCC employment agreement
- `difc_employment_contract_en` — DIFC employment agreement
- `adgm_employment_contract_en` — ADGM employment agreement

**Tier 2 — Commercial (high demand):**

- `dmcc_nda_mutual_en` — DMCC mutual NDA
- `difc_nda_mutual_en` — DIFC mutual NDA
- `dmcc_service_agreement_en` — DMCC service agreement
- `difc_service_agreement_en` — DIFC service agreement

**Tier 3 — Company formation:**

- `dmcc_shareholders_agreement_en`
- `difc_shareholders_agreement_en`
- `adgm_shareholders_agreement_en`

### Template Field Structure

Each template needs a `fields` array defining the variables. Example for an employment contract:

```json
[
  {
    "key": "employee_name",
    "label": "Employee Full Name",
    "type": "text",
    "required": true,
    "placeholder": "As per Emirates ID"
  },
  {
    "key": "employee_nationality",
    "label": "Nationality",
    "type": "text",
    "required": true
  },
  {
    "key": "employee_emirates_id",
    "label": "Emirates ID Number",
    "type": "text",
    "required": true
  },
  {
    "key": "job_title",
    "label": "Job Title",
    "type": "text",
    "required": true
  },
  {
    "key": "start_date",
    "label": "Employment Start Date",
    "type": "date",
    "required": true
  },
  {
    "key": "contract_type",
    "label": "Contract Type",
    "type": "select",
    "required": true,
    "options": ["Fixed Term", "Unlimited"]
  },
  {
    "key": "contract_duration_months",
    "label": "Contract Duration (months)",
    "type": "number",
    "required": false
  },
  {
    "key": "probation_months",
    "label": "Probation Period (months)",
    "type": "number",
    "required": true,
    "default_value": 6
  },
  {
    "key": "basic_salary",
    "label": "Basic Monthly Salary (AED)",
    "type": "number",
    "required": true
  },
  {
    "key": "housing_allowance",
    "label": "Housing Allowance (AED)",
    "type": "number",
    "required": false
  },
  {
    "key": "transport_allowance",
    "label": "Transport Allowance (AED)",
    "type": "number",
    "required": false
  },
  {
    "key": "notice_period_days",
    "label": "Notice Period (days)",
    "type": "number",
    "required": true,
    "default_value": 30
  },
  {
    "key": "annual_leave_days",
    "label": "Annual Leave (days)",
    "type": "number",
    "required": true,
    "default_value": 30
  },
  {
    "key": "non_compete_months",
    "label": "Non-Compete Period (months)",
    "type": "number",
    "required": false
  },
  {
    "key": "governing_law",
    "label": "Governing Law",
    "type": "select",
    "required": true,
    "options": ["UAE Federal Law", "DMCC Rules", "DIFC Law", "ADGM Law"]
  }
]
```

### How to Create DOCX Templates

1. Open Microsoft Word or Google Docs
2. Draft the contract with proper legal structure (preamble, definitions, clauses, signatures)
3. Replace variable values with `{{field_key}}` placeholders
4. Save as `.docx`
5. Upload via `POST /templates` with the field definitions and `ruleset_keys` to link to the relevant rulesets

**Where to source contract structures:**

- **DMCC**: DMCC provides sample employment contract templates to members — check if you have access via the member portal
- **DIFC**: DIFC publishes standard form contracts for common transaction types
- **ADGM**: ADGM has template agreements available through their portal
- **General UAE**: UAE MOHRE (Ministry of Human Resources) publishes standard employment contract forms — these are the baseline for mainland and many free zones adapt them
- You can also reference publicly available UAE contract templates from legal firms like Al Tamimi, Clyde & Co, or Hadef & Partners who publish template guides

**Important:** Have a UAE-qualified lawyer review any templates before production use. The contract structure matters for enforceability.

### Template Upload API

```bash
curl -X POST /templates \
  -F "key=dmcc_employment_contract_en" \
  -F "name=DMCC Employment Contract" \
  -F "description=Standard employment contract for DMCC free zone companies" \
  -F "authority_id=<DMCC UUID>" \
  -F "category_id=<employment category UUID>" \
  -F "languages=[\"en\"]" \
  -F "fields=<JSON array above>" \
  -F "ruleset_keys=[\"dmcc_employment_regulations_2024\"]" \
  -F "file=@/path/to/dmcc_employment_contract.docx"
```

### Linking Templates to Rulesets

When you create a template with `ruleset_keys`, the system links them via `template_rulesets`. This means when a user generates a document from that template, the compliance analysis will know which rulesets to check against. Currently the analysis searches globally over all `ruleset_chunks`, but the template-ruleset link is the foundation for scoped analysis in the future.

---

## Part 3: Recommended Execution Order

### Phase 1: Rulesets (do this first — RAG data is the foundation)

1. Download regulation PDFs for DMCC, DIFC, ADGM
2. Structure into clause JSON files (one file per ruleset)
3. Ingest via API or seed SQL
4. Verify: run a test compliance analysis against a sample contract

### Phase 2: Templates (depends on rulesets for linking)

1. Draft 3 employment contract DOCX templates (one per authority)
2. Upload via API with field definitions and ruleset links
3. Verify: generate a document and run compliance analysis on it

### Phase 3: Expand

- Add more regulation domains (data protection, commercial, AML)
- Add more template types (NDA, service agreement, shareholders agreement)
- Add more authorities (JAFZA, DAFZA, RAKEZ)

---

## Quick Reference: Key URLs for Sourcing

| Authority       | Primary Source                                        | Format     |
| --------------- | ----------------------------------------------------- | ---------- |
| **DMCC**        | `https://www.dmcc.ae/regulations`                     | PDF        |
| **DIFC**        | `https://www.difc.ae/laws-regulations/legal-database` | PDF        |
| **DIFC (DFSA)** | `https://dfsaen.thomsonreuters.com/`                  | HTML + PDF |
| **ADGM**        | `https://en.adgm.thomsonreuters.com/`                 | HTML + PDF |
| **UAE Federal** | `https://www.mohre.gov.ae/` (MOHRE for employment)    | PDF        |

## Quick Reference: Key Codebase Files

| What                   | Path                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Clause format          | [apps/api/src/modules/rulesets/dto/clause.dto.ts](apps/api/src/modules/rulesets/dto/clause.dto.ts)                                 |
| Create ruleset DTO     | [apps/api/src/modules/rulesets/dto/create-ruleset.dto.ts](apps/api/src/modules/rulesets/dto/create-ruleset.dto.ts)                 |
| Rulesets API           | [apps/api/src/modules/rulesets/rulesets.controller.ts](apps/api/src/modules/rulesets/rulesets.controller.ts)                       |
| Existing seed rulesets | [scripts/seeds/009_seed_rulesets.sql](scripts/seeds/009_seed_rulesets.sql)                                                         |
| Existing seed chunks   | [scripts/seeds/010_seed_ruleset_chunks.sql](scripts/seeds/010_seed_ruleset_chunks.sql)                                             |
| Authority seeds        | [scripts/seeds/001_seed_authorities.sql](scripts/seeds/001_seed_authorities.sql)                                                   |
| Template field format  | [apps/api/src/modules/templates/dto/template-field.dto.ts](apps/api/src/modules/templates/dto/template-field.dto.ts)               |
| Create template DTO    | [apps/api/src/modules/templates/dto/create-template.dto.ts](apps/api/src/modules/templates/dto/create-template.dto.ts)             |
| Embedding config       | [libs/embedding/src/embedding.constants.ts](libs/embedding/src/embedding.constants.ts)                                             |
| Ingestion worker       | [apps/worker-ingestion/src/services/ruleset-ingestion.service.ts](apps/worker-ingestion/src/services/ruleset-ingestion.service.ts) |
