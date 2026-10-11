import { stockLevel } from "#lib/materials/index.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { material } from "#lib/server/db/schema.ts";

import { query } from "../remote-functions.ts";

/** How many of the tenant's materials run low or out, by the same levels as the materials list. */
export const getStockLevels = query(async () => {
	const levels = (
		await db
			.select({ stock: material.stock, unit: material.unit })
			.from(material)
			.where(inTenant(material))
	).map((row) => stockLevel(row.stock, row.unit));
	return {
		low: levels.filter((level) => level === "low").length,
		out: levels.filter((level) => level === "out").length,
		total: levels.length,
	};
});
