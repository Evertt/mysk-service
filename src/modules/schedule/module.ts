import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";

import { defineModule } from "#lib/modules/define.ts";

export default defineModule({
	id: "schedule",
	label: m.schedule_module_name,
	description: m.schedule_module_description,
	route: "/(app)/(modules)/schedule",
	icon: CalendarDaysIcon,
	nav: { after: "orders" },
});
