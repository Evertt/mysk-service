import FlaskConicalIcon from "@lucide/svelte/icons/flask-conical";

import { defineModule } from "#lib/define-module.ts";
import { m } from "#lib/paraglide/messages.js";

export default defineModule({
	id: "sample",
	label: m.sample_module_name,
	description: m.sample_module_description,
	route: "/(app)/sample",
	icon: FlaskConicalIcon,
	slots: {
		dashboard: () => import("./sample-card.svelte"),
	},
});
