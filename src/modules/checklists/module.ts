import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";

import { defineModule } from "#lib/modules/define.ts";

import { checklistActions, checklistSubjects } from "./activity.ts";

export default defineModule({
	id: "checklists",
	label: m.checklists_module_name,
	description: m.checklists_module_description,
	// The work orders page ("Werkbonnen"): every unit with its checklist of this year.
	route: "/(app)/(modules)/checklists",
	// Managers set it up from the settings page: its templates, which the work orders page links to.
	settings: "/(app)/(modules)/checklists/templates",
	icon: ClipboardCheckIcon,
	subjects: checklistSubjects,
	actions: checklistActions,
	// Tells the condition module a unit's inspection status and its completed checklists, and the
	// parts shop the points its products fix.
	enhances: ["condition", "parts-shop"],
	nav: { after: "equipment" },
	// Inspection and maintenance orders get a checklist per unit.
	orderTypes: ["inspection", "maintenance"],
});
