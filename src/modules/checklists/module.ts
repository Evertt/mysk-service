import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";

import { defineModule } from "#lib/modules/define.ts";

import { checklistActions, checklistSubjects } from "./activity.ts";

export default defineModule({
	id: "checklists",
	label: m.checklists_module_name,
	description: m.checklists_module_description,
	route: "/(app)/(modules)/checklists/templates",
	// Managers set it up from the settings page too: its templates are what it does.
	settings: "/(app)/(modules)/checklists/templates",
	icon: ClipboardCheckIcon,
	subjects: checklistSubjects,
	actions: checklistActions,
	// Tells the condition module a unit's inspection status and its completed checklists.
	enhances: ["condition"],
	nav: { after: "equipment" },
	// Inspection and maintenance orders get a checklist per unit.
	orderTypes: ["inspection", "maintenance"],
});
