# WIRING GUIDE — OBSOLETE (kept as a tombstone)

> **Do not follow this document's previous contents.** The wiring it described
> was completed — and then evolved past — in 2026. It referenced engines that
> never shipped under those names (`decorSystem`, `dailyCareGuideEngine`),
> per-action routes (`POST /:id/feed` etc.) that were consolidated into
> `PATCH /:id/care`, and told the reader to remove the `corruptionEngine`
> import, which is live and load-bearing. Following it would regress the
> codebase.

## Where things actually live now

| Concern | Reality |
|---|---|
| Care actions | `PATCH /api/byte/:id/care` in `src/routes/byte.js` |
| Live snapshot (decay, corruption, XP, streaks) | `computeLiveByteSnapshot()` in `src/routes/byte.js` |
| Daily tasks / guide | `src/engine/dailyCareEngine.js` + `src/data/dailyTaskCatalog.js` |
| Decor | `src/data/decorCatalog.js` + `src/routes/decor.js` (effects consumed in the snapshot) |
| Death / legacy eggs | `POST /api/byte/:id/die` in `src/routes/byte.js` |
| Tunables | `src/config/gameBalance.js` (backend), `megabytes-frontend/config/tunables.ts` (frontend) |

For known issues and priorities, see `AUDIT.md` and `REPO_RECON_REPORT.md`.
