import { defineServerModule } from "#lib/server/modules.ts";

export default defineServerModule("sample", {
	orders: {
		// Nothing to say about any order.
		tag: async () => new Map(),
	},
});
