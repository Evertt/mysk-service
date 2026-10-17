/**
 * The demo tenants' locations, made from the places their generators give the units
 * (`generateSites`, SHLTR's `generateShltrEquipment`) as the migration that brought locations made
 * them from the old texts (`drizzle/0015_equipment-locations.sql`): one per distinct place at a
 * site, whatever the case, in alphabetical order. And the QR codes' tokens, which are random in
 * the app (`newQrToken()`), but the same every time in the demo, so a printed label keeps working
 * after `pnpm db:reset`.
 */
import { createHash } from "node:crypto";

/** A unit's site and its place there, as the generators have them. */
interface Placed {
	siteId: number;
	location: string | null;
}

/**
 * The locations of the sites' units' places (ids from 1, with their position at the site), and
 * the location of each unit that has a place (by the unit's id).
 */
export function generateLocations(units: Map<number, Placed>) {
	const key = (siteId: number, name: string) => `${siteId}:${name.toLowerCase()}`;
	const named = new Map<string, { siteId: number; name: string }>();
	for (const { siteId, location } of units.values()) {
		const name = location?.trim();
		if (!name) continue;
		const found = named.get(key(siteId, name));
		// Named as the first of the spellings reads, as SQLite's `min()` picks it.
		if (!found || name < found.name) named.set(key(siteId, name), { siteId, name });
	}
	const bySite = Map.groupBy(named.values(), (location) => location.siteId);
	const locations = [...bySite.keys()]
		.toSorted((a, b) => a - b)
		.flatMap((siteId) =>
			bySite
				.get(siteId)!
				.toSorted((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
				.map((location, position) => ({ ...location, position })),
		)
		.map((location, i) => ({ id: i + 1, ...location }));
	const idOf = new Map(
		locations.map((location) => [key(location.siteId, location.name), location.id]),
	);
	const locationOf = new Map(
		[...units].flatMap(([unitId, { siteId, location }]) =>
			location?.trim() ? [[unitId, idOf.get(key(siteId, location.trim()))!] as const] : [],
		),
	);
	return { locations, locationOf };
}

/**
 * A QR code's token for the demo: 24 hex digits like the app's, from the tenant and the record,
 * so it's the same every time the seed runs.
 */
export const seedQrToken = (tenant: string, kind: "unit" | "location", key: string | number) =>
	createHash("sha256")
		.update(`fieldworks-demo:${tenant}:${kind}:${key}`)
		.digest("hex")
		.slice(0, 24);
