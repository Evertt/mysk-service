import { defineSeed } from "#lib/server/db/seed/module-seed.ts";

import { sampleNote } from "./schema.ts";

export default defineSeed({
	clear: async (tx) => {
		await tx.delete(sampleNote);
	},
	async run({ tx, tenants, count }) {
		const rows = tenants.map((tenant) => ({
			organizationId: tenant.id,
			customerId: tenant.customerIds[0],
			text: `Hello from ${tenant.slug}`,
		}));
		await tx.insert(sampleNote).values(rows);
		count("sampleNotes", rows);
	},
});
