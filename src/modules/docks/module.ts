import WarehouseIcon from "@lucide/svelte/icons/warehouse";

import { defineModule } from "#lib/modules/define.ts";

import { dockActions, dockSubjects } from "./activity.ts";

export default defineModule({
	id: "docks",
	label: m.docks_module_name,
	description: m.docks_module_description,
	route: "/(app)/(modules)/docks",
	// Managers make the Salvo feed's tokens there; the docks themselves are on the customers' pages.
	settings: "/(app)/(modules)/docks/settings",
	settingsForManagers: true,
	icon: WarehouseIcon,
	subjects: dockSubjects,
	actions: dockActions,
	nav: { after: "equipment" },
	// A monitored door that's a dock's door shows the dock's state on energy's door card.
	enhances: ["energy"],
	// A dock door alert that escalates makes a breakdown order (`server/rules.ts`).
	orderTypes: ["breakdown"],
});
