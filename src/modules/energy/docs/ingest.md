# The energy feed: readings and door events

How a site's gateway feeds the energy module: `/energy/ingest`, with an integration token. The
real source (a P1 gateway on the main connection, sub-meters per zone, door sensors) isn't known yet
(open question #17 in `docs/plans/shltr-domain.md`); whatever it turns out to be posts this. Checked
by `ingest/format.ts`, stored by `server/ingest.ts`, alerts raised by `server/evaluate.ts`.

Readings are **aggregates per zone per 15 minutes**: the gateway keeps the meters' telegrams and
posts a batch now and then (every quarter hour, say). The app's database is one Durable Object on
Cloudflare, whose transactions hold every other request: one batch is one short transaction.

## Authentication

`Authorization: Bearer <token>`, a token a manager made for the energy module on its settings page
(`/energy/settings`; the core's `#lib/server/auth/integrations.ts`, which keeps only its hash). The
token stands for its tenant: a batch can only name that tenant's sites, zones and doors. A missing,
unknown or revoked token is a `401`; a tenant without the module gets a `404`.

## `GET /energy/ingest`

The token's sites with their codes, to set a gateway up:

```json
{
	"sites": [
		{
			"id": 1,
			"name": "Riedel Ede — Productielocatie",
			"timeZone": "Europe/Amsterdam",
			"zones": ["Z-R61", "Z-R62", "Z-TECH"],
			"doors": ["D-05", "D-06"]
		}
	]
}
```

## `POST /energy/ingest`

`Content-Type: application/json`, at most 1 MB:

```json
{
	"site": 1,
	"readings": [
		{
			"zone": "Z-R61",
			"start": "2026-10-17T08:00:00Z",
			"avgKw": 186.4,
			"peakKw": 201.2,
			"kwh": 46.6
		}
	],
	"doorEvents": [
		{ "door": "D-05", "at": "2026-10-17T08:03:12Z", "state": "open" },
		{ "door": "D-05", "at": "2026-10-17T08:17:40Z", "state": "closed" }
	]
}
```

- `site`: the energy site's id (from `GET`).
- `readings` (at most 2,000): a zone's meter over the 15 minutes from `start`.
  - `start`: an ISO 8601 moment with its offset, on a quarter hour (`:00`, `:15`, `:30`, `:45`,
    whole minutes); the interval must have ended, and be at most 90 days ago.
  - `avgKw`, `peakKw`: from 0 to 100,000, the peak at least the average.
  - `kwh`: the energy over the quarter hour, which is `avgKw / 4` (give or take 2 %).
- `doorEvents` (at most 2,000): a door's sensor going `open` or `closed` at `at` (not in the
  future, give or take a minute; at most 90 days ago).
- A zone and interval, and a door, moment and state, at most once per batch; at least one reading
  or event per batch. Fields that aren't these are refused.

### Idempotent

A batch can be sent again (after a timeout, say) without harm:

- a reading replaces the zone's reading of that interval (a corrected one counts);
- a door event that's in already is skipped;
- an alert is raised once per key: a zone's once per local hour, a door's once per opening.

Each batch is one transaction: all of it is stored, or none.

### Alerts

After each batch the site's thresholds are checked (`docs/plans/shltr-domain.md` §2.5):

- each zone that got readings, interval by interval: its average power against its max kW, and the
  day's consumption up to the interval against its max kWh (per day, in the site's time zone). The
  larger share counts: at 100 % the zone is over (an `active` alert), at 85 % near (a `near` one).
  Once per zone per hour, the worst interval of the hour; a near alert that's still open becomes
  active when the zone goes over within its hour.
- every door of the site: an opening that lasted (or, still open, has lasted until now) its
  threshold's minutes raises an alert, once per opening; while the alert is open, it follows the
  opening (the longest it was open).

Only the last 24 hours raise alerts: a gateway that catches up on last week raises none about it.
The site's page hears of each batch at once (its live query).

### Answers

| Status | Body                                                                                    |
| ------ | --------------------------------------------------------------------------------------- |
| 200    | `{ "readings": 672, "doorEvents": 210, "alerts": 3 }`: stored, new, raised              |
| 400    | `{ "error": "invalid_json", "message" }`: the body isn't JSON                           |
| 401    | no valid token                                                                          |
| 404    | `{ "error": "unknown_site", "message" }`: not one of the token's tenant's sites         |
| 413    | `{ "error": "too_large", "message" }`: over 1 MB                                        |
| 415    | `{ "error": "unsupported_media_type", "message" }`: not `application/json`              |
| 422    | `{ "error": "invalid_batch", "message", "issues": ["readings[3].start: …"] }`           |
| 422    | `{ "error": "unknown_codes", "message", "unknown": { "zones": ["Z-X"], "doors": [] } }` |

## The simulator

`node src/modules/energy/server/simulator.ts` posts a day of SHLTR's Riedel Ede (today up to now,
or `--day=2026-10-12` for a whole one) to a running app (`--url=http://localhost:5173`), with the
demo token the seed gives SHLTR (or `ENERGY_TOKEN`). The seed's history comes from the same
simulation, so posting a seeded day again changes nothing.
