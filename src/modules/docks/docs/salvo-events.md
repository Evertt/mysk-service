# The Salvo event feed

How the Salvo dock hardware (or whatever relays it) tells Fieldworks what happens at a tenant's docks.
The real Salvo integration isn't known yet (open question 16 in `docs/plans/shltr-domain.md`): this is
the contract the docks module offers, and what an adapter for Salvo's own API or events would post.
`scripts/docks-simulator.ts` (`pnpm docks:simulate`) posts it for the demo.

## Endpoint

`POST /docks/ingest`, with:

- `Authorization: Bearer <token>`: an integration token of the tenant's, made by a manager on
  `/docks/settings` (shown once; only its SHA-256 is stored). The token says whose docks the events
  are about. A missing, unknown or revoked token is a `401`; a tenant without the docks module a `404`.
- `Content-Type: application/json` (else `415`), and a body:

```json
{
	"events": [
		{
			"id": "salvo-barneveld-000123",
			"type": "check_in",
			"dock": "DOCK 05",
			"at": "2026-10-17T07:58:12Z",
			"payload": {
				"carrier": "AMEX Transport",
				"plate": "84-BNX-7",
				"reference": "WB-20416",
				"slot": { "start": "2026-10-17T07:30:00Z", "end": "2026-10-17T08:15:00Z" }
			}
		},
		{
			"id": "salvo-barneveld-000124",
			"type": "key_moved",
			"dock": "DOCK 05",
			"at": "2026-10-17T07:58:40Z",
			"payload": { "to": "driver" }
		},
		{
			"id": "salvo-barneveld-000125",
			"type": "lock",
			"dock": "DOCK 05",
			"at": "2026-10-17T08:01:02Z"
		}
	]
}
```

An empty batch (`{ "events": [] }`) is a heartbeat: it applies nothing but runs the door rules (below).

## Events

Every event has exactly these fields (any other is refused):

| Field     | What                                                                                       |
| --------- | ------------------------------------------------------------------------------------------ |
| `id`      | The event's own id, 1–100 characters, unique for the tenant: an id seen before is skipped. |
| `type`    | One of the types below.                                                                    |
| `dock`    | The dock's code as it's set up in Fieldworks (`DOCK 05`): one of the token tenant's docks. |
| `at`      | When it happened: ISO 8601 with an offset (`Z` or `+02:00`); at most 5 minutes ahead.      |
| `payload` | Only for the types that take one, with only the fields listed.                             |

| Type         | Payload                                                                 | What it does                                                                              |
| ------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `check_in`   | optional: `carrier`, `plate`, `reference` (texts), `slot` `{start,end}` | Starts the dock's session (ending one still open). The dock is Bezet until it's locked.   |
| `lock`       | none                                                                    | The Wheel-Lok is on: the dock is Laden, its beacon green.                                 |
| `unlock`     | none                                                                    | The Wheel-Lok is off.                                                                     |
| `door_open`  | none                                                                    | The sectional door opened: its open time counts from `at`.                                |
| `door_close` | none                                                                    | The door closed: its open time is added to the session.                                   |
| `key_moved`  | `to`: `scp`, `driver` or `storage`                                      | Where the dock's Salvo key is now (in the SCP, with the driver, in the key storage unit). |
| `scp_fault`  | optional: `reason` (text, e.g. `Sleutelfout`)                           | The SCP has a fault: the dock is Storing, its beacon red, until `scp_ok`.                 |
| `scp_ok`     | none                                                                    | The SCP works again.                                                                      |
| `check_out`  | none                                                                    | Ends the session and releases the Wheel-Lok. A door still open stays open (and counted).  |

The dock's state follows from these: Storing while its SCP is faulty, else Laden while locked, else
Bezet while a session is open, else Vrij; the beacon follows the state (red, green, orange, off).

## How a batch is applied

- At most 100 events per batch; the whole batch is validated first, and refused with a `422` and
  `{ "error": "invalid_batch", "issues": [{ "path": "events.3.at", "message": "…" }] }` if anything
  is wrong, or `{ "error": "unknown_docks", "docks": ["DOCK 99"] }` if it names a dock the token's
  tenant doesn't have (another tenant's included). Nothing of a refused batch is applied.
- The events are applied in the order of their `at` (in the order sent for the same time), in one
  transaction: all or nothing.
- Idempotent per event `id`: a batch sent twice applies once (the second time, every event is a
  `duplicate`). Ids are kept for 30 days.
- An event older than the last one applied at its dock is recorded but not applied (`stale`): a
  late event can't turn a dock back.
- The answer: `{ "results": [{ "id": "…", "outcome": "applied" | "duplicate" | "stale" }], "applied": 2,
"duplicates": 0, "stale": 0, "orders": ["2026-00412"] }`, the results in the order sent; `orders`
  are breakdown orders the door rules made.
- The live board (`/docks`) updates as soon as the batch is in.

## The door rules

After every batch (and in the daily job), the docks module looks at the tenant's open doors:

- open 40 minutes or more: the board shows the door amber, and the dock planner gets a notice (an
  entry `door_alert` in the activity log on the dock, listed on the board);
- open an hour or more: red, and a breakdown order ("Mogelijke storing aan de sectionaaldeur, deur 60+
  min open") on the dock's door unit, through the core's `createOrders()`: at most one open such order
  per door (`dock_escalation`), logged as `door_escalated`.

Each band acts once per opening; closing the door resets it.
