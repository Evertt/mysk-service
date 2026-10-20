// The core tables' relations, for `with:` loads: on the same column pairs as their keys
// (`tenantOne()`), so a load stays in the tenant. Here rather than with each table, as they point
// both ways between the domains' files.
import { relations } from "drizzle-orm";

import { user } from "../auth.schema.ts";
import { tenantOne } from "../columns.ts";
import { customer, customerSite } from "./customers.ts";
import { engineer } from "./engineers.ts";
import { equipment, equipmentCategory, equipmentLocation } from "./equipment.ts";
import { order, orderNote, orderUnit } from "./orders.ts";
import { portalContact, portalContactSite } from "./portal.ts";

export const customerRelations = relations(customer, ({ many }) => ({
	sites: many(customerSite),
	equipment: many(equipment),
	orders: many(order),
}));

export const customerSiteRelations = relations(customerSite, ({ one, many }) => ({
	customer: tenantOne(one, customerSite.customerId, customer),
	equipment: many(equipment),
	/** Load them in their order: `orderBy: asc(equipmentLocation.position)`. */
	locations: many(equipmentLocation),
}));

export const equipmentLocationRelations = relations(equipmentLocation, ({ one, many }) => ({
	site: tenantOne(one, equipmentLocation.siteId, customerSite),
	equipment: many(equipment),
}));

export const engineerRelations = relations(engineer, ({ many }) => ({
	orders: many(order),
}));

export const equipmentCategoryRelations = relations(equipmentCategory, ({ many }) => ({
	equipment: many(equipment),
}));

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
	customer: tenantOne(one, equipment.customerId, customer),
	category: tenantOne(one, equipment.categoryId, equipmentCategory),
	site: one(customerSite, {
		fields: [equipment.customerId, equipment.siteId],
		references: [customerSite.customerId, customerSite.id],
	}),
	location: one(equipmentLocation, {
		fields: [equipment.siteId, equipment.locationId],
		references: [equipmentLocation.siteId, equipmentLocation.id],
	}),
	orderUnits: many(orderUnit),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
	customer: tenantOne(one, order.customerId, customer),
	/** Load them in their order: `orderBy: asc(orderUnit.position)`. */
	units: many(orderUnit),
	engineer: tenantOne(one, order.engineerId, engineer),
}));

export const orderUnitRelations = relations(orderUnit, ({ one }) => ({
	order: tenantOne(one, orderUnit.orderId, order),
	equipment: one(equipment, {
		fields: [orderUnit.customerId, orderUnit.equipmentId],
		references: [equipment.customerId, equipment.id],
	}),
}));

export const portalContactRelations = relations(portalContact, ({ one, many }) => ({
	customer: tenantOne(one, portalContact.customerId, customer),
	sites: many(portalContactSite),
	user: one(user, { fields: [portalContact.userId], references: [user.id] }),
}));

export const portalContactSiteRelations = relations(portalContactSite, ({ one }) => ({
	contact: tenantOne(one, portalContactSite.contactId, portalContact),
	site: one(customerSite, {
		fields: [portalContactSite.customerId, portalContactSite.siteId],
		references: [customerSite.customerId, customerSite.id],
	}),
}));

export const orderNoteRelations = relations(orderNote, ({ one }) => ({
	order: tenantOne(one, orderNote.orderId, order),
	user: one(user, { fields: [orderNote.userId], references: [user.id] }),
}));
