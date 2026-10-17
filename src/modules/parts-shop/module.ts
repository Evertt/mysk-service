import ShoppingCartIcon from "@lucide/svelte/icons/shopping-cart";

import { defineModule } from "#lib/modules/define.ts";

import { shopActions, shopSubjects } from "./activity.ts";

export default defineModule({
	id: "parts-shop",
	label: m.shop_module_name,
	description: m.shop_module_description,
	route: "/(app)/(modules)/parts-shop",
	// Managers set up its categories; the products are any office member's.
	settings: "/(app)/(modules)/parts-shop/categories",
	icon: ShoppingCartIcon,
	subjects: shopSubjects,
	actions: shopActions,
	// Its products are materials, with their stock; it's paid for with the partners' credit.
	requires: ["materials", "partner-programme"],
	// Suggests the part a rejected checklist point needs.
	enhances: ["checklists"],
	nav: { after: "materials" },
	// The catalogue, the cart and the checkout with Parts Credit, in the customer portal.
	portal: {
		route: "/(customer)/(modules)/parts-shop/portal",
		label: m.shop_portal_label,
		icon: ShoppingCartIcon,
	},
});
