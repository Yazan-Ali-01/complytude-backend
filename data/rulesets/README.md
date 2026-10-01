# Rulesets

The legal text analyses are checked against. Each file is a draft for legal review: nothing here is
final until a law firm has reviewed it and the review is recorded on the version
(`POST /rulesets/:key/versions/:version/review`). Production analyses use reviewed versions only.

## File format

A `POST /rulesets` body (see `ClauseItemDto` and `apps/api/docs/API_CONTRACTS.md` → Managing
rulesets), with the authority named by code instead of `authority_id`:

```json
{
  "key": "uae_federal_labour_law",
  "name": "…",
  "description": "…",
  "authority": { "code": "MOHRE", "name": "Ministry of Human Resources and Emiratisation" },
  "jurisdictions": ["MAINLAND", "…"],
  "document_types": ["employment"],
  "clauses": [
    {
      "id": "flr_art_8_3",
      "title": "Employment Contract: specified term",
      "content": "The published text, verbatim",
      "order": 5,
      "is_required": true,
      "article": "Art. 8(3)",
      "severity": "high",
      "source_title": "…",
      "source_url": "https://…",
      "effective_date": "2022-02-02",
      "guidance": "A plain-language explanation: the model reads it, no finding cites it"
    }
  ]
}
```

- One clause per article or sub-article. `content` is the source's words; only line wrapping, page
  numbers and footnote markers are removed, and a sub-article's own number is left to `article`.
- `is_required`: a term every contract of this type must state or meet; the analysis checks it
  whatever the search finds, and reports its absence.
- `severity`, `is_required` and `guidance` are the drafter's proposals for the reviewer to confirm.
- `apps/api/test/documents/ruleset-files.integration.spec.ts` loads every file here through the API
  and ingests it.

## Status

| File | Jurisdictions | Document types | Clauses | Status |
|---|---|---|---|---|
| `uae_federal_labour_law.json` | Mainland, DMCC, IFZA, RAKEZ, SHAMS, DAFZA, JAFZA | employment | 72 (10 required) | Draft, drafted 2026-10-01 |
| `uae_labour_law_implementing_regulation.json` | Mainland, DMCC, IFZA, RAKEZ, SHAMS, DAFZA, JAFZA | employment | 28 (1 required) | Draft, drafted 2026-10-01 |
| `dmcc_company_regulations.json` | — | — | 34 | Summarised, not verbatim, old file shape; to be replaced by a verbatim draft |

## uae_federal_labour_law.json

Federal Decree-Law No. (33) of 2021 Regarding the Regulation of Employment Relationships, as
amended, in force from 2 February 2022 (Art. 74).

**Sources** (MOHRE, consolidated English text; retrieved 2026-10-01):

| Publication | URL | SHA-256 | Used for |
|---|---|---|---|
| October 2025 (with Cabinet Resolution No. 1 of 2022) | https://mohre.gov.ae/assets/download/e82f7872/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments_638990571068264034.pdf.aspx | `db64033dcaefdd8981e7ab2f4e121f22614790ee56edc44f4e1130dda1d833b6` | Every article except 13, 29, 32 and 42 |
| January 2024 | https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx | `e31ffb0ee7e09312be26211126ddd79e039468a881f0f883c515b66eef6d8142` | Articles 13, 29, 32 and 42 |

The official portal's page is https://uaelegislation.gov.ae/en/legislations/1541 (it refuses
automated downloads, so it wasn't used).

**Method.** Text extracted with `pdftotext` (the 2025 file one half-page at a time, since it lays out
two pages per sheet) and split into articles by script; every paragraph was compared word for word
with the other publication. They agree except where the 2025 text corrects the 2024 one (Art. 44(2)
drops a stray "the"; Art. 45 restores "may": "The worker may quit work without notice"), changes
punctuation only (Art. 30(1)), or where the 2025 file's text layer is doubled (Arts. 13, 29, 32, 42:
taken from the 2024 file). Two spaces missing from the 2024 file's text layer were restored
("pursuant to a judgment", Art. 25(1)(g); "both parties", Art. 35).

**Scope.** The articles an employment contract can breach or must contain: equality, recruitment
fees, the contract and its term, probation, non-competition, change of work, employer obligations,
forced labour and harassment, working hours, overtime, weekend, wage and deductions, public holidays,
leave, termination and notice, dismissal and quitting without notice, unlawful termination,
end-of-service gratuity, payment of final dues, the minimum-rights and nullity rule, and the Arabic
contract rule. Procedural, inspection and penalty articles (Arts. 54–64) are left out.

**Jurisdictions.** The decree-law covers the whole private sector (Art. 3(1)). DIFC and ADGM have
their own employment laws and are excluded; DMCC applies the decree-law, with its own rules on top.
For the reviewer to confirm.

**Gaps.**

- **Art. 8(3)**, amended by Federal Decree-Law No. (14) of 2022: the date the amendment took effect
  isn't confirmed, so the clause has no `effective_date` and the version can't be marked reviewed
  until the reviewer supplies it.
- **Arts. 13, 29, 32, 42**: taken from the January 2024 publication because the 2025 file's text
  layer is doubled on those pages; it shows at least one possible edit ("fulfill" / "fulfil" in
  Art. 42(9)). Confirm against the 2025 publication.
- **Arabic.** The Arabic text prevails (Art. 66(2)) and isn't carried; the clauses are MOHRE's English
  text.
- **Implementing Regulation.** Cabinet Resolution No. (1) of 2022 (contract forms, working hours in
  Ramadan, non-compete exceptions, leave rules) isn't drafted yet; it is a separate ruleset.
- **Later amendments.** Federal Decree-Law No. (20) of 2023 and No. (9) of 2024 amended Art. 54
  (disputes) and Art. 60 (penalties), neither of which is included. Check for amendments after
  October 2025.

## uae_labour_law_implementing_regulation.json

Cabinet Resolution No. (1) of 2022 on the Implementation of Federal Decree-Law No. (33) of 2021, in
force from 2 February 2022 (Art. 39). It applies alongside `uae_federal_labour_law.json`, with the
same jurisdictions.

**Source:** the October 2025 MOHRE consolidated publication listed above (the Resolution follows the
decree-law in the same file; SHA-256 `db64033d…833b6`). MOHRE's February 2022 standalone PDF
(https://www.mohre.gov.ae/assets/download/6bd9158/Cabinet%20Resolution%20_Executive%20Regulations%20Decree-Law%20No.%2033.pdf.aspx)
is marked "Not an official translation" and is an earlier, different translation (the 2025 text is
revised, e.g. gender-neutral wording), so it wasn't used for the text.

**Method.** As for the decree-law. The articles used extract cleanly (Arts. 9 and 22, whose text
layer is doubled, aren't used); a check for glued or garbled words (anything outside an English
dictionary and the 2022 translation) found none in them. A line-break hyphen left in the text layer was closed up ("Decree- Law" → "Decree-Law",
Arts. 21(4) and 29(2)).

**Scope.** What the contract must state (Art. 10(1), required), contract forms and work types,
non-competition rules and exemptions, reassignment, working hours (Ramadan, overtime, exempt
categories), wage payment through WPS, leave (part-time, carrying forward, cash in lieu, combining),
disciplinary procedure, transfer, end-of-service deductions and part-time gratuity. Left out:
classification, work permits, recruitment agencies, safety, injuries, disputes, inspection and
penalties.

**Gaps.**

- **Amendments.** The October 2025 publication marks none for the Resolution; amendments by later
  Cabinet resolutions weren't searched for. Confirm the text is current.
- **Arabic**, as for the decree-law.

