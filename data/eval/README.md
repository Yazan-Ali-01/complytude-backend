# AI evaluation set

The labelled contracts `pnpm eval:ai` scores the analysis worker against. How to run it and what the scores mean: `apps/worker-ai/docs/README.md` → Evaluation.

| Path | What |
|---|---|
| `rulesets/*.json` | The rulesets the contracts are checked against, frozen so the labels' clause IDs never move: the five demo rulesets from `scripts/seeds/009_seed_rulesets.sql` and the DMCC Company Regulations summary from `data/rulesets/`. **Paraphrased demo text, not legal text.** |
| `contracts/*.md` | The contracts, frozen: the five sample contracts from the `rag-mock` module, the DMCC shareholders' agreement from `data/test-documents/`, and two prompt-injection contracts. |
| `cases/*.json` | One label file per contract (below). |
| `results/` | One report per real run (`.md` summary, `.json` with every finding). |
| `HISTORY.md` | One row per real run: the trend. |

## Labels

```jsonc
{
  "id": "mainland-employment",
  "contract": "mainland-employment.md",
  "labelledBy": "who wrote the labels, and whether a lawyer reviewed them",
  "expected": [      // must be reported: counts for recall and precision
    { "rulesetKey": "uae_labour_law_employment_v1", "clauseId": "uae_lab_02", "severity": "high", "why": "…" }
  ],
  "acceptable": [    // defensible either way: never a miss, never a false positive
    { "rulesetKey": "…", "clauseId": "…", "why": "…" }
  ],
  "mustNotFlag": [   // a clause, or a whole ruleset (no clauseId), that doesn't apply
    { "rulesetKey": "difc_employment_law_v1", "why": "Dubai mainland employer" }
  ],
  "expectedMentions": [ // optional: a case-insensitive pattern the titles, descriptions or summary must match
    { "pattern": "(pre-?cleared|ignore)", "why": "the injection attempt is reported" }
  ]
}
```

- Label what the law requires, not what the demo data claimed: the DIFC contract's federal labour law and PDPL findings are **must-not-flag**, because neither applies in the DIFC.
- Findings a run reports on unlabelled clauses show in the report as candidates: label them `expected`, `acceptable` or `mustNotFlag`.
- The current labels are engineering's and provisional. The set is meant to grow to 30–50 real, anonymised contracts (mainland, free zones, DIFC, ADGM; English and Arabic; clean ones included), labelled or reviewed by a lawyer.
- Changing a label changes the scores: note it in the next `HISTORY.md` row's report.
