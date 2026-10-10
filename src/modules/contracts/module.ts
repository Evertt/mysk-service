import FileCheckIcon from "@lucide/svelte/icons/file-check";

import { defineModule } from "#lib/modules/define.ts";

import { contractSubjects } from "./activity.ts";

export default defineModule({
	id: "contracts",
	label: m.contracts_module_name,
	description: m.contracts_module_description,
	route: "/(app)/(modules)/contracts",
	icon: FileCheckIcon,
	subjects: contractSubjects,
	enhances: ["invoicing"],
});
