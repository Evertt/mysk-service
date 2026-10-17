/**
 * Where a QR code (`/q/<token>`, see `../qr.ts`) leads. A token is looked up across the tenants,
 * the one place that does so on purpose: the code doesn't say whose it is. Whoever scans it only
 * gets there through a membership of the record's tenant (`src/routes/q/[token]/+server.ts`), so
 * another tenant's code is a 404 for them, as if it didn't exist.
 */
import { and, eq } from "drizzle-orm";

import { isCustomerContact, isFieldEngineer, parseRoles } from "#lib/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import {
	customerSite,
	equipment,
	equipmentLocation,
	member,
	portalContact,
	portalContactSite,
} from "#lib/server/db/schema.ts";

import { qrTokenPattern } from "../qr.ts";

/** A new QR code's token: 24 hex digits, from the platform's cryptographic random numbers. */
export function newQrToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(12));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** What a QR code is on: a unit (by its serial number, which its pages go by) or a location. */
export type QrTarget =
	| { kind: "unit"; organizationId: string; id: number; serialNumber: string }
	| { kind: "location"; organizationId: string; id: number };

/** The unit or location whose code has `token`, in whichever tenant; nothing for an unknown one. */
export async function findQrTarget(token: string): Promise<QrTarget | undefined> {
	if (!qrTokenPattern.test(token)) return undefined;
	const [unit] = await db
		.select({
			organizationId: equipment.organizationId,
			id: equipment.id,
			serialNumber: equipment.serialNumber,
		})
		.from(equipment)
		.where(eq(equipment.qrToken, token));
	if (unit) return { kind: "unit", ...unit };
	const [location] = await db
		.select({ organizationId: equipmentLocation.organizationId, id: equipmentLocation.id })
		.from(equipmentLocation)
		.where(eq(equipmentLocation.qrToken, token));
	return location && { kind: "location", ...location };
}

/**
 * Who scans a code, as it decides where it leads: someone of the office, a field engineer in their
 * portal, or a customer's contact in the customer portal, for whom it opens "report a breakdown"
 * on the unit or at the location.
 */
export type QrViewer = "office" | "engineer" | "customer";

/**
 * Whether the customer's contact `userId` sees the unit or location the code is on: it's their
 * customer's, at one of the sites they see. Looked up in the code's tenant by its id: the scan
 * may come before it's their current one.
 */
async function customerSees(target: QrTarget, userId: string) {
	const { organizationId } = target;
	const [contact] = await db
		.select({
			id: portalContact.id,
			customerId: portalContact.customerId,
			allSites: portalContact.allSites,
		})
		.from(portalContact)
		.where(and(eq(portalContact.organizationId, organizationId), eq(portalContact.userId, userId)));
	if (!contact) return false;
	const [place] =
		target.kind === "unit"
			? await db
					.select({ customerId: equipment.customerId, siteId: equipment.siteId })
					.from(equipment)
					.where(and(eq(equipment.organizationId, organizationId), eq(equipment.id, target.id)))
			: await db
					.select({ customerId: customerSite.customerId, siteId: customerSite.id })
					.from(equipmentLocation)
					.innerJoin(
						customerSite,
						and(
							eq(customerSite.id, equipmentLocation.siteId),
							eq(customerSite.organizationId, organizationId),
						),
					)
					.where(
						and(
							eq(equipmentLocation.organizationId, organizationId),
							eq(equipmentLocation.id, target.id),
						),
					);
	if (!place || place.customerId !== contact.customerId) return false;
	if (contact.allSites) return true;
	const [site] = await db
		.select({ siteId: portalContactSite.siteId })
		.from(portalContactSite)
		.where(
			and(
				eq(portalContactSite.organizationId, organizationId),
				eq(portalContactSite.contactId, contact.id),
				eq(portalContactSite.siteId, place.siteId),
			),
		);
	return !!site;
}

/**
 * What the code with `token` is on and who `userId` is there, if they're a member of its tenant;
 * nothing otherwise (no such code, or another tenant's), which is a 404 for them. A field
 * engineer (`isFieldEngineer`) is led to the portal, a customer's contact (`isCustomerContact`) to
 * the customer portal if it's on their customer's unit or location at a site they see (another
 * customer's is a 404 for them too), everyone else to the office's pages.
 */
export async function resolveQrCode(token: string, userId: string) {
	const target = await findQrTarget(token);
	if (!target) return undefined;
	const [membership] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, target.organizationId)));
	if (!membership) return undefined;
	const roles = parseRoles(membership.role);
	if (isCustomerContact(roles)) {
		return (await customerSees(target, userId))
			? { target, viewer: "customer" as QrViewer }
			: undefined;
	}
	const viewer: QrViewer = isFieldEngineer(roles) ? "engineer" : "office";
	return { target, viewer };
}

/**
 * The page a code leads `viewer` to: the office's page of the unit or location, the engineer
 * portal's, with the engineer's open orders for it, or the customer portal's "report a breakdown",
 * with the unit filled in or the location's units to choose from.
 */
export function qrDestination(target: QrTarget, viewer: QrViewer): string {
	if (target.kind === "unit") {
		const serial = encodeURIComponent(target.serialNumber);
		if (viewer === "customer") return `/portal/report?unit=${serial}`;
		return viewer === "engineer" ? `/my/equipment/${serial}` : `/equipment/${serial}`;
	}
	if (viewer === "customer") return `/portal/report?location=${target.id}`;
	return viewer === "engineer" ? `/my/locations/${target.id}` : `/equipment/locations/${target.id}`;
}
