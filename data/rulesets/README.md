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
| `difc_employment_law.json` | DIFC | employment | 56 (4 required) | Draft, drafted 2026-10-01 |
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


## difc_employment_law.json

Employment Law, DIFC Law No. 2 of 2019, as amended by DIFC Laws No. 4 of 2020, No. 4 of 2021,
No. 2 of 2022, No. 1 of 2024 and No. 1 of 2025. DIFC legislation is enacted in English, so the
text is the law itself, not a translation.

**Sources** (DIFC, retrieved 2026-10-01):

| Publication | URL | SHA-256 | Used for |
|---|---|---|---|
| Consolidated Version No. 5 (July 2025) | https://edge.sitecorecloud.io/dubaiintern0078-difcexperie96c5-production-3253/media/project/difcexperiences/difc/difcwebsite/documents/laws--regulations/employment-law.pdf | `e305ebc7bbe7907859fa7989845dbe6cd3690844f34ad7f8d6e77783aeb8aaeb` | The text |
| Consolidated Version No. 4 (March 2024) | https://assets.difc.com/v1/media/edge/images/dubaiintern0078-difcexperie96c5-production-3253/media/project/difcexperiences/difc/difcwebsite/documents/laws--regulations/employment_law_no_2_of_2019_updated_2024.pdf | `2ebc89e3bfd3b305e24990b279d9eb9b5d3ddb162bbbf570591ce233a26990eb` | Dating 2025 changes |
| Consolidated Version No. 2 (September 2021) | https://assets.difc.com/v1/media/edge/images/dubaiintern0078-difcexperie96c5-production-3253/media/project/difcexperiences/difc/difcwebsite/documents/past-laws/employment_law_2_of_2019_consolidated_sep_2021_2.pdf | `4d2bd1e4d04b022670c08e0c4733913d0afe7298649e4a05374563c1c4762032` | Dating 2024 changes |
| Employment Law Amendment Law, DIFC Law No. 4 of 2021 | https://assets.difc.com/v1/media/edge/images/dubaiintern0078-difcexperie96c5-production-3253/media/project/difcexperiences/difc/difcwebsite/documents/laws--regulations/employment_law_amendment_law_difc_law_no_4_of_2021.pdf | `6e65bdad5ac60690e565ce63c59628a404084d69ba6189a1567b5ff267682a98` | Finding the provisions amended in 2021 |

**Method.** `pdftotext` (layout mode), parsed by article, sub-article and item from the
indentation; every line of every clause was checked against a second, raw-mode extraction of the same
file. The July 2025 and March 2024 consolidations agree word for word except Arts. 65(3) and 66(7)(c)
(the 2025 amendment).

**Effective dates**, per clause, from which versions its words differ in:

- unchanged since enactment: 28 August 2019 (enacted 30 May 2019, in force ninety days later, Art. 6);
- changed by DIFC Law No. 1 of 2025: 15 July 2025, the fifth business day after enactment on 8 July
  2025 (the enactment notice's rule), computed, not published;
- changed by DIFC Law No. 1 of 2024: 8 March 2024 (same rule from 1 March 2024; matches published
  commentary). No selected clause was last changed by it;
- changed by the 2020 or 2021 amendment laws: **left empty**, because the enactment notices for those
  laws weren't found. Affected: Arts. 14(2), 20(1), 21(3), 27(3), 32(3), 40(2), 59(1), 60, 63(3),
  66(1), 66(13). Their effective dates must be supplied before the version can be marked reviewed.
  The 2021 amendment law reprints the whole law with changes marked by underline and strike-through,
  which text extraction can't see; a provision counts as changed in 2021 if the amendment law's words
  for it differ from the September 2021 consolidation's, so a few may be flagged that weren't changed.

**Scope.** Waiver, false representations, children, the written contract and its contents, pay
statements, paydays, final payments, deductions, recruitment costs, working time, Ramadan, rest and
breaks, vacation leave, public holidays, special, sick, maternity and paternity leave, return to work,
health insurance, visas and passports, discrimination and victimisation, notice, termination for
cause, reasons, pensions for UAE and GCC nationals, gratuity and qualifying scheme (DEWS)
contributions. Left out: administration, payroll records, part-time calculations, health and safety
premises rules, proceedings, fines and Schedules 1–2 (definitions and fines).

**Gaps.**

- The effective dates above.
- **Defined terms.** Capitalised terms (Wage, Basic Wage, Work Day, Qualifying Scheme, …) are defined
  in Schedule 1, which isn't carried. Consider adding the definitions a contract review needs.
- **Employment Regulations.** The DIFC Employment Regulations (made under Art. 9) aren't drafted yet.
