# AI evaluation set

The labelled contracts `pnpm eval:ai` scores the analysis worker against. How to run it and what the scores mean: `apps/worker-ai/docs/README.md` → Evaluation.

| Path | What |
|---|---|
| `rulesets/*.json` | The rulesets the contracts are checked against (with the jurisdictions and document types they apply to), frozen so the labels' clause IDs never move: the five demo rulesets from `scripts/seeds/009_seed_rulesets.sql` and a summary of the DMCC Company Regulations that `data/rulesets/dmcc_company_regulations.json` held before its verbatim draft replaced it. **Paraphrased demo text, not legal text.** |
| `contracts/*.md` | The contracts, frozen: the five sample contracts from the `rag-mock` module, the DMCC shareholders' agreement from `data/test-documents/`, and two prompt-injection contracts. |
| `cases/*.json` | One label file per contract (below). |
| `results/` | One report per real run (`.md` summary, `.json` with every finding). |
| `HISTORY.md` | One row per real run: the trend. |

## Labels

```jsonc
{
  "id": "mainland-employment",
  "contract": "mainland-employment.md",
  "jurisdiction": "MAINLAND",           // with documentType: the run uses the rulesets tagged with both
  "documentType": "employment",         // (or "rulesetKeys": [...] to pick them explicitly)
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
  ],
  "pii": ["Mariam", "784-1990-1234567-6"] // optional: values that must never reach a provider (synthetic only)
}
```

- Label what the law requires, not what the demo data claimed: the DIFC contract's federal labour law and PDPL findings are **must-not-flag**, because neither applies in the DIFC.
- Findings a run reports on unlabelled clauses show in the report as candidates: label them `expected`, `acceptable` or `mustNotFlag`.
- The current labels are engineering's and provisional. The set is meant to grow to 30–50 real, anonymised contracts (mainland, free zones, DIFC, ADGM; English and Arabic; clean ones included), labelled or reviewed by a lawyer.
- Changing a label changes the scores: note it in the next `HISTORY.md` row's report.

## Production feedback

Users accept or dismiss each finding of an analysis (`PATCH /analysis-jobs/:id/findings/:findingId`). Every decision is stored in `analysis_finding_feedback` with the result's model and prompt version and the finding's ruleset and clause chunk, so dismissals can be compared between prompt versions and traced to a clause. A dismissal's reason is cleared when its document is erased; the decision and its provenance stay.

**Dismissal rate by prompt version and ruleset** (last 30 days). The table has row-level security: run it as the platform login inside a transaction that sets `SELECT set_config('app.platform_role', 'true', true)`, or it sees no tenant's rows.

```sql
SELECT prompt_version,
       ruleset_key,
       COUNT(*)                                          AS reviewed,
       COUNT(*) FILTER (WHERE decision = 'dismissed')    AS dismissed,
       ROUND(100.0 * COUNT(*) FILTER (WHERE decision = 'dismissed') / COUNT(*), 1) AS dismissal_rate_pct
FROM public.analysis_finding_feedback
WHERE decided_at > now() - interval '30 days'
GROUP BY prompt_version, ruleset_key
ORDER BY prompt_version DESC, dismissal_rate_pct DESC;
```

**Which clauses are dismissed most** (at least 5 reviews each), with the reasons to read:

```sql
SELECT f.ruleset_key,
       c.metadata->>'clauseId'                           AS clause_id,
       COUNT(*)                                          AS reviewed,
       COUNT(*) FILTER (WHERE f.decision = 'dismissed')  AS dismissed,
       array_agg(f.reason) FILTER (WHERE f.reason IS NOT NULL) AS reasons
FROM public.analysis_finding_feedback f
LEFT JOIN public.ruleset_chunks c ON c.id::text = f.chunk_id
GROUP BY f.ruleset_key, c.metadata->>'clauseId'
HAVING COUNT(*) >= 5
ORDER BY COUNT(*) FILTER (WHERE f.decision = 'dismissed')::numeric / COUNT(*) DESC;
```

**Promoting a reviewed case into this set.** Review the week's dismissals. A case enters the set only when all of these hold:

1. The reviewer agrees with the user's decision. Anything about what a clause legally requires is the legal reviewer's call (D-9).
2. The contract is not a customer's. Customer contracts never enter this repository: write a synthetic contract that reproduces the pattern (fictional parties, names and amounts) and add it to `contracts/`. The only other route is the customer's written agreement plus anonymization, and that needs the owner's sign-off.
3. It is labelled as the reviewer decided. An accepted finding goes in `expected`. A dismissed finding on a clause that doesn't apply goes in `mustNotFlag`, and one defensible either way goes in `acceptable`. `labelledBy` says it came from production feedback, who reviewed it, and the prompt version it was seen on.

Then run `pnpm eval:ai` and add the run to `HISTORY.md`, so the new case's effect on recall and precision is recorded.
