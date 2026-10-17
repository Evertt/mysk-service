/**
 * Where a QR code (`/q/<token>`, see `../qr.ts`) leads. A token is looked up across the tenants,
 * the one place that does so on purpose: the code doesn't say whose it is. Whoever scans it only
 * gets there through a membership of the record's tenant (`src/routes/q/[token]/+server.ts`), so
 * another tenant's code is a 404 for them, as if it didn't exist.
 */
import { and, eq } from "drizzle-orm";

import { isFieldEngineer, parseRoles } from "#lib/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment, equipmentLocation, member } from "#lib/server/db/schema.ts";

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
 * Who scans a code, as it decides where it leads: someone of the office, or a field engineer in
 * their portal. (The customer portal will add its customers here, for whom a code opens "report a
 * breakdown" on the unit or location.)
 */
export type QrViewer = "office" | "engineer";

/**
 * What the code with `token` is on and who `userId` is there, if they're a member of its tenant;
 * nothing otherwise (no such code, or another tenant's), which is a 404 for them. A field
 * engineer (`isFieldEngineer`) is led to the portal, everyone else to the office's pages.
 */
export async function resolveQrCode(token: string, userId: string) {
	const target = await findQrTarget(token);
	if (!target) return undefined;
	const [membership] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, target.organizationId)));
	if (!membership) return undefined;
	const viewer: QrViewer = isFieldEngineer(parseRoles(membership.role)) ? "engineer" : "office";
	return { target, viewer };
}

/**
 * The page a code leads `viewer` to: the office's page of the unit or location, or the engineer
 * portal's, with the engineer's open orders for it.
 */
export function qrDestination(target: QrTarget, viewer: QrViewer): string {
	if (target.kind === "unit") {
		const serial = encodeURIComponent(target.serialNumber);
		return viewer === "engineer" ? `/my/equipment/${serial}` : `/equipment/${serial}`;
	}
	return viewer === "engineer" ? `/my/locations/${target.id}` : `/equipment/locations/${target.id}`;
}
