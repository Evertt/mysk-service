import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";

import { defineModule } from "#lib/modules/define.ts";

import { shopActions, shopSubjects } from "./activity.ts";

export default defineModule({
	id: "parts-shop",
	label: m.shop_module_name,
	description: m.shop_module_description,
	icon: ShoppingCartIcon,
	subjects: shopSubjects,
	actions: shopActions,
	// Its products are materials, with their stock; it's paid for with the partners' credit.
	requires: ["materials", "partner-programme"],
	// Suggests the part a rejected checklist point needs, and tells the condition module the
	// points its products fix, which a component with one of them as its article is checked by.
	enhances: ["checklists", "condition"],
	nav: { after: "materials" },
	// The catalogue, the cart and the checkout with Parts Credit, in the customer portal.
	portal: {
		label: m.shop_portal_label,
		icon: ShoppingCartIcon,
	},
});
