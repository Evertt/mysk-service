import FileCheckIcon from "@lucide/svelte/icons/file-check";

import { defineModule } from "#lib/modules/define.ts";

import { contractSubjects } from "./activity.ts";

export default defineModule({
	id: "contracts",
	label: m.contracts_module_name,
	description: m.contracts_module_description,
	route: "/(app)/(modules)/contracts",
	icon: FileCheckIcon,
	slots: {
		dashboard: () => import("./dashboard-cards.svelte"),
		order: () => import("./order-coverage.svelte"),
		equipment: () => import("./equipment-coverage.svelte"),
	},
	subjects: contractSubjects,
	enhances: ["invoicing"],
});
