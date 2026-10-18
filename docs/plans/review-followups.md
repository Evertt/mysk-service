# Review follow-ups (develop vs main, 2026-10-18)

What's still open after the review of `develop` and its follow-ups. Verify against the code before
fixing: lines drift.

- **The partners list's wallet column** (`src/modules/partner-programme/server/list-sql.ts`,
  `walletBalanceSql`) sorts and filters by the balance, while the partner card shows the credit
  available today. They differ by credit past its date until the daily job (04:00 UTC) expires it.
  An exact figure in SQL needs each spend to record which credit it took: a schema change.
- **A daily kWh alert that's already over** keeps the reading from when it went over; it doesn't
  follow the day's kWh as it grows (as a door's alert follows its opening). Small, if wanted.
- **Open hourly kWh alerts from before the daily key** (`zone:<id>:<day>T<hh>`) stay open until
  someone resolves them; a power breach in that same hour would match one of them.
- **The seed's `linkDemoEngineer`** (`src/lib/server/db/seed/users.ts`) moves an early scheduled
  mechanical job to "in progress" today; if that were the Weggemans dock inspection, Lev would lose
  his scheduled inspection of several units (simulated over 70 days, it never was; no spec checks it).
