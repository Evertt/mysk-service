/**
 * Who may read and change the parts shop's records (`#lib/server/access/`, contributed in
 * `server/index.ts`). The office reads and manages them (the categories are a manager's). A
 * customer's contact shops from the whole catalogue (products and their categories) and reads their
 * customer's shop orders, not limited to sites (as the portal reads them).
 */
import { type AccessRule, rows } from "#lib/server/access/rules.ts";
import { ofCustomer } from "#lib/server/auth/index.ts";

import type { shopSubjects } from "../activity.ts";
import { shopCategory, shopOrder, shopProduct } from "./schema.ts";

export const shopAccess = {
	shop_order: rows(shopOrder, shopOrder.id, {
		office: true,
		customer: ({ access }) => ofCustomer(access, shopOrder),
	}),
	shop_product: rows(shopProduct, shopProduct.id, { office: true, customer: true }),
	shop_category: rows(
		shopCategory,
		shopCategory.id,
		{ office: true, customer: true },
		{ change: "manager" },
	),
} satisfies Record<keyof typeof shopSubjects, AccessRule>;
