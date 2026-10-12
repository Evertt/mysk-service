/**
 * The seed's time zone: the demo company's, Amsterdam's, whatever the machine running the seed is
 * set to, so the demo data's days (midnight starts, "today", the months) are the same everywhere.
 * Imported first by `index.ts`, so it's set before any other module reads the zone (Node takes a
 * change to `TZ` at once, for `Date` and `Intl` alike).
 */
process.env.TZ = "Europe/Amsterdam";
