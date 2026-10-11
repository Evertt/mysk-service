import PackageIcon from "@lucide/svelte/icons/package";

import { defineModule } from "#lib/modules/define.ts";

export default defineModule({
	id: "materials",
	label: m.materials_module_name,
	description: m.materials_module_description,
	route: "/(app)/materials",
	icon: PackageIcon,
	nav: { after: "engineers" },
});
