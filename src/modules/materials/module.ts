import PackageIcon from "@lucide/svelte/icons/package";

import { defineModule } from "#lib/modules/define.ts";

import { materialActions, materialSubjects } from "./activity.ts";

export default defineModule({
	id: "materials",
	label: m.materials_module_name,
	description: m.materials_module_description,
	icon: PackageIcon,
	nav: { after: "engineers" },
	subjects: materialSubjects,
	actions: materialActions,
	// Its materials are the articles of the condition module's components.
	enhances: ["condition"],
});
