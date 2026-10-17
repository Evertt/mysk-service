import { unitModel } from "#lib/equipment/index.ts";

/**
 * What a unit's title (`unitTitle()`, its name if it has one) doesn't say, then `more` (its
 * category, site, location…), on one line: `Hörmann ST 50 · H1234567 · Dock 03`.
 */
export const unitDetails = (
	unit: { name: string | null; manufacturer: string; model: string; serialNumber: string },
	...more: (string | null | undefined)[]
) => [unit.name ? unitModel(unit) : null, unit.serialNumber, ...more].filter(Boolean).join(" · ");
