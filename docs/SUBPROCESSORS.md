# Sub-processors

The third parties that process customer data for Complytude, what each receives, where, and on what terms. It is the list organizations agree to when they accept the AI processing disclosure (version `AI_DISCLOSURE_VERSION` in `apps/api/src/common/constants/ai-disclosure.constant.ts`).

**Status: pre-production.** Rows marked *not signed* or *pending* are open; they must be settled before customer data is processed in production.

## AI and document processing

Contract analysis sends contract text to these processors only after the organization has accepted the disclosure (`POST /tenants` with `aiDisclosureVersion`, or `POST /tenants/me/ai-consent`). Personal data in the text is masked first: names, Emirates IDs, passport numbers, IBANs, phone numbers, email addresses and street addresses are replaced with placeholders before any request, and put back only in the stored result (`apps/worker-ai/docs/README.md` → Redaction). Document titles are never sent.

| Processor | Service | Purpose | Data sent | Region | Retention at the processor | Used for training | Agreement | Zero data retention |
|---|---|---|---|---|---|---|---|---|
| OpenAI | API: embeddings and chat completions | Finding the regulations that apply to each part of a contract, and judging compliance | Masked contract text; regulation text | Set by `OPENAI_BASE_URL`: `api.openai.com` (global, United States) by default; `ae.api.openai.com` (UAE data residency) once approved for the project | Up to 30 days for abuse monitoring by default; none under zero data retention | No (API data is not used for training by default) | DPA not signed | Not yet approved (to apply for, with UAE data residency) |
| Cohere | Rerank API | Ordering candidate regulations by relevance | A query of up to 4,000 characters sampled from the masked contract text; regulation text | Global (`api.cohere.com`) | Cohere's default API terms | Not reviewed | None | None |
| Microsoft | Azure AI Document Intelligence (`prebuilt-layout`) | Reading scanned pages (OCR) | Only the pages of an uploaded PDF without usable text (scans), as a PDF of those pages. They are not masked: OCR has to see the page. Pages with a text layer are read on our own servers and never sent | UAE North | Deleted by us as soon as the text is read; otherwise kept by the service for at most 24 hours | No | Microsoft Products and Services Data Protection Addendum (part of the Azure subscription terms); date to record | Not applicable (deleted after reading) |

**Being removed:** Cohere (the rerank step is being replaced so that no document text leaves for a provider without a UAE region or an agreement).

**Self-hosted, not sub-processors:** the name-recognition service used for masking (`REDACTION_NER_URL`) and the document converter (Gotenberg) run inside our own infrastructure.

## Infrastructure and other services

| Processor | Purpose | Data | Region |
|---|---|---|---|
| Amazon Web Services | Hosting of the staging environment: containers, database, file storage, malware scanning, email (SES) | Everything the application stores | `eu-central-1` (Frankfurt). Production hosting is planned in Azure UAE North and not set up yet |
| Stripe | Subscriptions, invoices and card payments | Organization name, a tenant admin's email, the subscription and its invoices; card details go to Stripe directly and never through Complytude | Stripe's global infrastructure |

**Also contacted, without customer data:** the Pwned Passwords range API (only the first five characters of a password's SHA-1 hash, to reject breached passwords); Google and Microsoft sign-in, when a user chooses them (the identity provider the user signs in with).

## How this list is kept

- Each analysis records the processors it used and where, in `result.provenance.processors` (`processor`, `purpose`, `region`, `model`; for OCR, the pages read).
- `apps/api/src/common/subprocessors-register.spec.ts` fails when the code constructs an AI client, or imports an AI provider's package, that this page doesn't list.
- A new processor, a new region, or a new kind of data sent means a new disclosure version: raise `AI_DISCLOSURE_VERSION`, and every organization is asked to accept again before its next analysis.
