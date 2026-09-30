# AI evaluation history

One row per real `pnpm eval:ai` run (`apps/worker-ai/docs/README.md` → Evaluation). Record a run before and after any change to the prompt, the models or retrieval.

| Date | Commit | Chat model | Embeddings | Rerank | Prompt | Runs | Recall | Precision | Strict precision | Must-not-flag hits | Severity | Mentions | Agreement | Redaction | Report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-09-30 | `3c2a699` | gpt-4o-mini | text-embedding-3-small | rerank-v3.5 | v1 | 8×3 | 46% | 90% | 83% | 13 | 89% | 33% | 76% | n/a | [report](results/2026-09-30-21-40-16-3c2a699.md) |
| 2026-09-30 | `2a170d9` | gpt-4o-mini | text-embedding-3-small | rerank-v3.5 | v5 | 9×3 | 77% | 96% | 73% | 9 | 91% | 50% | 88% | 100% | [report](results/2026-09-30-21-44-43-2a170d9.md) |
