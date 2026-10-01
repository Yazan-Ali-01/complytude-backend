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

## Loading

`pnpm rulesets:load` (with the database, Redis and worker-ingestion running) loads every file here:
new rulesets get version 1.0.0, a file whose clauses changed gets a new minor version, and each new
version is queued for ingestion. Versions stay inactive until activated with
`POST /rulesets/:key/versions/:version/activate`, which needs them ingested and, where review is
required (production), reviewed. See `docs/DEPLOYMENT.md` → Load Rulesets.

## Status

| File | Jurisdictions | Document types | Clauses | Status |
|---|---|---|---|---|
| `uae_federal_labour_law.json` | Mainland, DMCC, IFZA, RAKEZ, SHAMS, DAFZA, JAFZA | employment | 72 (10 required) | Draft, drafted 2026-10-01 |
| `uae_labour_law_implementing_regulation.json` | Mainland, DMCC, IFZA, RAKEZ, SHAMS, DAFZA, JAFZA | employment | 28 (1 required) | Draft, drafted 2026-10-01 |
| `difc_employment_law.json` | DIFC | employment | 56 (4 required) | Draft, drafted 2026-10-01 |
| `adgm_employment_regulations.json` | ADGM | employment | 58 (5 required) | Draft, drafted 2026-10-01 |
| `dmcc_employment_rules.json` | DMCC | employment | 23 (2 required) | Draft, drafted 2026-10-01 |
| `difc_data_protection_law.json` | DIFC | data_processing | 22 (2 required) | Draft, drafted 2026-10-01 |
| `adgm_data_protection_regulations.json` | ADGM | data_processing | 23 (2 required) | Draft, drafted 2026-10-01 |
| `adgm_companies_regulations.json` | ADGM | shareholders_agreement | 31 (3 required) | Draft, drafted 2026-10-01 |
| `difc_companies_law.json` | DIFC | shareholders_agreement | 31 (3 required) | Draft, drafted 2026-10-01 |
| `difc_data_protection_regulations.json` | DIFC | data_processing | 7 | Draft, drafted 2026-10-01 |
| `dmcc_company_regulations.json` | DMCC | shareholders_agreement | 34 (2 required) | Draft, drafted 2026-10-01 (replaces an earlier summary) |

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

## adgm_employment_regulations.json

ADGM Employment Regulations 2024, enacted by the ADGM Board, published 3 January 2025, in force
1 April 2025 (s. 75(4)), as amended. ADGM legislation is enacted in English, so the text is the
regulations themselves.

**Source:** the consolidated version in the ADGM Rulebook (the PDF the Rulebook page,
https://en.adgm.thomsonreuters.com/rulebook/employment-regulations-2024, links as current; retrieved
2026-10-01):
https://en.adgm.thomsonreuters.com/sites/default/files/net_file_store/ADGM1547_27534_VER20251028.pdf,
SHA-256 `b6654f3ff5f0286c895789cde6f084a0d0b24a82a19fd92cf7364053cba68095`.

**Method.** `pdftotext` (layout mode) parsed by section, subsection and item; a subsection label
counts only at the label column, in sequence and followed by a capital (so a wrapped "(3) from any
payments" stays text). Every clause line was checked against two other extractions of the same file;
the only differences are theirs (page numbers inside paragraphs, words joined at line ends). Footnote
markers on amended section headings were removed from the titles.

**Effective dates.** 1 April 2025, except the sections the consolidation footnotes as "Amended 28
October 2025" (ss. 2–5, 7, 9, 15–17, 48, 51, 58, 59, 63, 74, 75), dated 28 October 2025: the
footnote's date, to be confirmed as the date the amendment came into force.

**Scope.** Waiver and settlement agreements, false representations, children, visas and permits, the
written contract and what it must include, amendments, pay statements, probation, remote employees,
pay period, deductions, final payment, working time, Ramadan, rest and breaks, vacation leave and pay
in lieu, national holidays, special and bereavement leave, sick leave and pay, maternity and
paternity, health insurance, discrimination and victimisation, notice, termination for cause,
reasons, pensions for UAE and GCC nationals, gratuity, repatriation flight. Left out: records,
part-time pro-rating, ante-natal time off, health and safety premises rules, employee duties,
whistleblowing, the Registrar's procedures, fees, and the definitions (s. 74).

**Gaps.**

- **Defined terms** (s. 74: Wages, Basic Wage, Working Day, …) aren't carried.
- **Application.** The Regulations don't apply to employers holding a dual licence whose employees
  are governed by the UAE Labour Law, nor to employers the Board exempts (s. 75(3)); such an ADGM
  contract needs the federal rulesets instead. Jurisdiction tagging can't express that yet.
- **Rules made by the Board** under the Regulations (s. 70) aren't drafted.

## dmcc_employment_rules.json

The DMCC Authority's Employment Rules, Version 3 (updated 12 December 2022). They apply to DMCC
licensees and their employees **on top of** the UAE Labour Law (Rule 2.1), so a DMCC employment
analysis uses this ruleset together with `uae_federal_labour_law.json` and
`uae_labour_law_implementing_regulation.json` (both tagged DMCC).

**Source:** the PDF linked from DMCC's Compliance and regulations page
(https://dmcc.ae/members/support/knowledge-bank/compliance-and-regulations; retrieved 2026-10-01):
https://dmcc.ae/hubfs/o2-Website%202023%20Assets/o2-Website%202023-PDF%20Updates%20(Nov%2023)/Support/Rules%20and%20Regulations/Employment_Rules_V3_-_Done.pdf,
SHA-256 `5d267017ed5b134e5445b5fa424ca6cb6dd2104b5d521742046319874b5430ea`.

**Method.** `pdftotext` (layout mode) parsed by section and numbered rule; every clause line checked
against two other extractions of the same file. `article` is the rule number ("Rule 9.3").

**Effective date.** 12 December 2022, the version's update date on its cover: the Rules state no
commencement date. To be confirmed.

**Scope.** DMCC's own requirements: no contracting out of the Labour Law, work outside the free zone,
charges and sanctions, recruitment costs, passports, the written limited-term contract, insurance,
accommodation, harassment, notice and termination formalities, final payment, repatriation flight,
visa cancellation. Left out: administrative rules (sponsorship, entry permits, approvals), Rule 11.1
(a summary of the Labour Law's leave entitlements, which the federal rulesets carry in the law's own
words), pointers to DMCC guides, dispute resolution and definitions.

**Gaps.**

- **Outdated definition.** The Rules define "UAE Labour Law" as Federal Law No. 8 of 1980, which
  Federal Decree-Law No. 33 of 2021 repealed, while Rule 16.3 cites Article 44 of the new law. The
  reviewer should read the references as being to the current law, or check for a newer version.
- **DMCC guides** referred to by the Rules (Ramadan, flexible work, family-friendly leave,
  disciplinary procedures, limited-term contracts, visa cancellation) aren't carried.

## difc_data_protection_law.json

Data Protection Law, DIFC Law No. 5 of 2020, in force 1 July 2020 (Art. 4), as amended by DIFC Laws
Amendment Law No. 2 of 2022 and DIFC Laws Amendment Law No. 1 of 2025. English is the language of
DIFC legislation.

**Sources** (DIFC, retrieved 2026-10-01):

| Publication | URL | SHA-256 | Used for |
|---|---|---|---|
| Consolidated Version (July 2025) | https://edge.sitecorecloud.io/dubaiintern0078-difcexperie96c5-production-3253/media/project/difcexperiences/difc/difcwebsite/documents/laws--regulations/data-protection-law.pdf | `48b5e3a4ee96dcfea7393c157e08709e032b4bfff347a8544e9a10ca87e564f0` | The text |
| DIFC Laws Amendment Law No. 2 of 2022 | https://assets.difc.com/v1/media/edge/images/dubaiintern0078-difcexperie96c5-production-3253/media/project/difcexperiences/difc/difcwebsite/documents/laws--regulations/difc_laws_amendment_law_for_enactment_final_styled_by_lexis_004_4.pdf | `1a0be482288ccfc0d1b16041262ab5b7d90ac58093e0079eaab8c427fa6d18e7` | Which provisions changed in 2022 |
| DIFC Laws Amendment Law No. 1 of 2025 | https://assets.difc.com/v1/media/edge/images/dubaiintern0078-difcexperie96c5-production-3253/media/project/difcexperiences/difc/difcwebsite/documents/laws--regulations/amendment-law-no-1-of-2025.pdf | `4fc881a234e1a0750c89034f2a22fd1205bbd090e1ea2e842b666ef425ba9ba9` | Which provisions changed in 2025 |

**Method.** As for the DIFC Employment Law (layout parsing by article, sub-article and item,
including (A)/(B) sub-items; every clause line checked against a raw-mode extraction; the only
differences are a page break and the raw mode dropping the hyphen in "Sub-processor").

**Effective dates.** 1 July 2020, except sub-articles an amendment law reprints (each prints only the
provisions it amends, with the rest elided): Art. 9(1), amended by the 2022 law, dated 7 March 2022,
and Art. 28(1), amended by the 2025 law, dated 15 July 2025. Both dates are the fifth business day
after the enactment notices (28 February 2022, 8 July 2025), computed, not published.

**Scope.** For a data processing agreement: the processing principles, lawful bases, special
categories, security and organisational measures, records, joint controllers, processors and
sub-processors (the written agreement and what it must contain, required), confidentiality,
transfers out of the DIFC, data sharing on request, and breach notification. Left out: DPO and
impact-assessment detail, information notices, data subject rights, the Commissioner, remedies and
Schedules (definitions and fines).

**Gaps.**

- **Defined terms** (Schedule 1: Controller, Processor, Personal Data Breach, …) aren't carried.
- **Data Protection Regulations** made under the Law: see `difc_data_protection_regulations.json`.

## adgm_data_protection_regulations.json

ADGM Data Protection Regulations 2021, enacted 11 February 2021, as amended (consolidated version
August 2025). English is the language of ADGM legislation.

**Source:** the consolidated PDF that the ADGM Rulebook page
(https://en.adgm.thomsonreuters.com/rulebook/data-protection-regulations-2021) links as current
(retrieved 2026-10-01):
https://en.adgm.thomsonreuters.com/sites/default/files/net_file_store/ADGM1547_23167_VER992025.pdf,
SHA-256 `b63a20bd9be6aa4c3277f5adc730ee335e776de5233d54001ea921e747f59fa7`.

**Method.** As for the ADGM Employment Regulations; Parts here are headed "PART I" with the title on
the next line. Footnote markers were removed from section headings and, once, from inside the text
("ADGM’s Board3", s. 15(3)(a), not used here). Every clause line was checked against two other
extractions of the same file.

**Effective dates.** The Regulations replaced the Data Protection Regulations 2015, which s. 63(1)
repealed 6 months after publication for establishments set up after publication and 12 months after
it for those already established. Unamended provisions are dated **11 February 2022**: 12 months after
the enactment date, taken as the publication date. That's when they bound every establishment; to be
confirmed. Sections the consolidation footnotes as amended carry the footnote's date (s. 7: 9 September
2025).

**Scope.** For a data processing agreement: principles and accountability, lawful bases, special
categories, controller measures, joint controllers, processors (the written contract and what it must
contain, required), sub-processors, processing under authority, records, security, breach
notification, and transfers out of ADGM. Left out: data subject rights, DPO and impact assessments,
codes and certification, the Commissioner, remedies and definitions (s. 62).

**Gaps.**

- The 11 February 2022 date above.
- **Defined terms** (s. 62) aren't carried.
- **Standard contractual clauses** adopted by the Commissioner (ss. 26(6), 42(2)) aren't carried.

## dmcc_company_regulations.json

DMCCA Company Regulations 2024 [Amended], issued on 10 October 2024 and updated on 2 January 2025.
This file used to hold a paraphrased summary of the same Regulations (still used, frozen, by the
evaluation set); it is now the Regulations' own text.

**Source:** the PDF linked from DMCC's Compliance and regulations page (retrieved 2026-10-01):
https://dmcc.ae/hubfs/Compliance%20Documents%202024/DMCCA%20Company%20Regulations%20-%202024%20%5BAmended%5D.pdf,
SHA-256 `96748cccb799efffb84d89492cee342faf52eaac39bbe45d997eb8db656e45d1`.

**Method.** `pdftotext` (layout mode) parsed by article (headings accepted only in sequence, since
later Sections reuse numbered lists), numbered regulation ("47.1") and item; the running footer and
page numbers removed; every clause line checked against two other extractions of the same file (one
difference: a page break). One clause per article, since the articles are short; the regulation
numbers stay in the text.

**Effective date.** 2 January 2025, the update date on every page. The Regulations don't mark which
articles changed on that date, so articles unchanged since 10 October 2024 carry the later date too.
To be confirmed (DMCC publishes a summary of changes:
https://dmcc.ae/hubfs/Compliance%20Documents%202024/DMCC%20Comprehensive%20Summary%20of%20Changes-%20Final.pdf).

**Scope.** For a shareholders' agreement in a DMCC company: the Articles and their binding effect,
shareholders, shares and their classes, alteration and reduction of capital, non-cash consideration,
bearer shares, buy-backs and redeemable shares, variation of class rights, the shareholder register
and share transfers (required with the nature of shares), dividends and distributions, directors and
their duties, secretary and manager, general meetings, written resolutions, proxies and minutes. Left
out: the Registrar, branches, continuation, registers other than shareholders', accounts and audit,
inspection, amalgamation, winding-up and the general provisions.

**Gaps.**

- **Defined terms** (Article 1: Ordinary Resolution, Special Resolution, Articles, …) aren't carried;
  the resolution thresholds they set matter for shareholders' agreements.
- **Other contract types.** Tagged for shareholders' agreements only.

## adgm_companies_regulations.json

ADGM Companies Regulations 2020, enacted 29 April 2020 and in force on publication (s. 1071(3)), as
amended (consolidated version June 2026). English is the language of ADGM legislation.

**Source:** the consolidated PDF that the ADGM Rulebook page
(https://en.adgm.thomsonreuters.com/rulebook/companies-regulations-2020) links as current (retrieved
2026-10-01):
https://en.adgm.thomsonreuters.com/sites/default/files/net_file_store/ADGM1547_20963_VER20260626.pdf,
SHA-256 `8aae2ffcfa9cdc927894ad82e41e08e3eba235092c63d4a64a3349e0268249f0`.

**Method.** `pdftotext` (layout mode) parsed by section, subsection and item. The 633-page text has
243 amendment footnotes (a number, then one or more "Amended <date>" lines) whose markers are glued
to a word in the heading or text; footnotes are numbered in order, so each marker was found as the
next number glued to a word after the previous one, and dated the heading or subsection it sits in
(five markers weren't found, all in sections not used here). The Parts are taken from the table of
contents, since most Part headings aren't in the text layer. Every clause line was checked against a
raw-mode extraction; the only differences are page numbers.

**Effective dates.** A section's latest footnoted amendment (s. 27: 24 April 2026; s. 508: 28 October
2025; s. 858: 9 September 2024); otherwise 29 April 2020, the enactment date, taken as the publication
date on which the Regulations came into force. To be confirmed.

**Scope.** For a shareholders' agreement in an ADGM company: articles, their amendment and entrenched
provisions, resolutions and agreements affecting the constitution and their filing, removal of
directors (required), directors' general duty and conflicts, resolutions (ordinary, special, written)
and meetings, transferability and registration of transfers, allotment, pre-emption (required) and
its exclusion and disapplication, classes and variation of class rights (required), distributions
out of profits, and the unfair-prejudice petition. One clause per section.

**Gaps.**

- **Defined terms** (Part 34 and Schedule 3) and the **model articles** that apply by default (s. 18)
  aren't carried.
- **Other Parts** that can bear on shareholders' agreements (acquisition of own shares, Part 17;
  arrangements and reconstructions, Part 25; mergers and divisions, Part 26) aren't covered.

## difc_companies_law.json

Companies Law, DIFC Law No. 5 of 2018, enacted 5 November 2018 and in force 12 November 2018 (DIFC
legal database), as amended by DIFC Laws Amendment Law No. 2 of 2022, which changed only its Schedule
1 rules of interpretation (the meaning of "day"). The 2024 and 2025 amendment laws don't amend it.
English is the language of DIFC legislation.

**Source:** the PDF DIFC's Companies Law page links (retrieved 2026-10-01), Consolidated Version
(March 2022):
https://edge.sitecorecloud.io/dubaiintern0078-difcexperie96c5-production-3253/media/project/difcexperiences/difc/difcwebsite/documents/laws--regulations/companies_law.pdf,
SHA-256 `e4025e807af4c7f81cce763c02531e4c74628446d3a9fa2480a1a9b526cd9e7c`.

**Method.** As for the other DIFC laws, with chapter headings skipped; every clause line checked
against a raw-mode extraction. One clause per article.

**Effective dates.** 12 November 2018 for every clause.

**Scope.** For a shareholders' agreement in a DIFC company: the Articles, their effect and
alteration, filing of resolutions and agreements, variation of class rights (required) and the right
to object, shareholders and shares, alteration of capital, bearer shares, pre-emption (required) and
its exceptions, the register, transfers (required), buy-backs, financial assistance, distributions,
directors (election, removal, duties, interests, loans), meetings and written resolutions, minority
buy-out rights, and unfair prejudice.

**Gaps.**

- **Defined terms** (Schedule 1) aren't carried.
- **Companies Regulations** made under the Law aren't drafted:
  https://assets.difc.com/v1/media/edge/images/dubaiintern0078-difcexperie96c5-production-3253/media/project/difcexperiences/difc/difcwebsite/documents/laws--regulations/companies_regulations_2018.pdf

## difc_data_protection_regulations.json

The Data Protection Regulations made under the DIFC Data Protection Law, Consolidated Version No. 2,
in force 1 September 2023. Applies with `difc_data_protection_law.json`.

**Source:** https://assets.difc.com/v1/media/edge/images/dubaiintern0078-difcexperie96c5-production-3253/media/project/difcexperiences/difc/difcwebsite/documents/laws--regulations/data-protection-regulation.pdf
(linked from DIFC's legal database pages; retrieved 2026-10-01), SHA-256
`1b9d02b30f95951016f04a174261a31945e711ab97f76cb1b4982f29119996b6`.

**Method.** `pdftotext` (layout mode) parsed by regulation ("10.2") and its numbered rules
("10.2.1"), stopping at the appendices. Regulation 10 carries twelve footnotes of DIFC guidance
("Guidance on Regulation 10.1: …"); they are commentary, not rules, so they're left out, and their
markers were removed by their exact context (e.g. "Systems1", "System. 4", "concepts: 9"), each
checked to occur once. Every clause line was checked against a raw-mode extraction; the differences
are the raw mode's (dropped hyphens, guidance paragraphs interleaved).

**Effective dates.** 1 September 2023, the date this consolidated version came into force, for every
clause; provisions unchanged since earlier versions carry it too. To be confirmed.

**Scope.** Records of processing (Reg. 2.1), transfers out of the DIFC with the Commissioner's standard
contractual clauses (Reg. 5), breach reporting (Regs. 8.1, 8.2), and processing through autonomous and
semi-autonomous systems: definitions, deployers' and operators' obligations, and general requirements
(Regs. 10.1–10.3). None is a required contract term. Left out: notifications and fees, supervision,
complaints, fines, inadvertently obtained data, digital communications consent, and the appendices.

**Gaps.**

- **The standard contractual clauses** themselves (published separately by the Commissioner) aren't
  carried.
- **DIFC's guidance** on Regulation 10 could serve as these clauses' `guidance`; it isn't used.
