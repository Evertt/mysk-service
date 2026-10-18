# Review follow-ups (develop vs main, 2026-10-18)

What's still open after the review of `develop` and its follow-ups. Verify against the code before
fixing: lines drift.

- **The partners list's wallet column** (`src/modules/partner-programme/server/list-sql.ts`,
  `walletBalanceSql`) sorts and filters by the balance, while the partner card shows the credit
  available today. They differ by credit past its date until the daily job (04:00 UTC) expires it.
  An exact figure in SQL needs each spend to record which credit it took: a schema change.
