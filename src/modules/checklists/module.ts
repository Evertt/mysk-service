import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";

import { defineModule } from "#lib/modules/define.ts";

import { checklistActions, checklistSubjects } from "./activity.ts";

export default defineModule({
	id: "checklists",
	label: m.checklists_module_name,
	description: m.checklists_module_description,
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
