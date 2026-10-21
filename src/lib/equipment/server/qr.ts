/**
 * Where a QR code (`/q/<token>`, see `../qr.ts`) leads. A token is looked up across the tenants,
 * the one place that does so on purpose: the code doesn't say whose it is. Whoever scans it only
 * gets there through a membership of the record's tenant (`src/routes/q/[token]/+server.ts`), so
 * another tenant's code is a 404 for them, as if it didn't exist.
 */
import { eq } from "drizzle-orm";

import type { ShellName } from "#lib/auth/index.ts";
import { mayReadIn } from "#lib/server/access/index.ts";
import { viewerIn } from "#lib/server/access/viewer.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment, equipmentLocation } from "#lib/server/db/schema.ts";

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
 * Who scans a code, as it decides where it leads: the shell they work in (`shellOf()`), the
 * office, a field engineer's portal, or the customer portal, where it opens "report a breakdown"
 * on the unit or at the location.
 */
export type QrViewer = ShellName;

/**
 * What the code with `token` is on and who `userId` is there, if they're a member of its tenant;
 * nothing otherwise (no such code, or another tenant's), which is a 404 for them. By their shell
 * there (`shellOf()`): a field engineer is led to the portal, a customer's contact to the customer
 * portal if it's on their customer's unit or location at a site they see (another customer's is a
 * 404 for them too: the access registry's `equipment` and `location` rules, asked as them in the
 * code's tenant, which the scan may come before it's their current one), everyone else to the
 * office's pages.
 */
export async function resolveQrCode(
	token: string,
	userId: string,
): Promise<{ target: QrTarget; viewer: QrViewer } | undefined> {
	const target = await findQrTarget(token);
	if (!target) return undefined;
	const asking = await viewerIn(target.organizationId, userId);
	if (!asking) return undefined;
	if (asking.audience === "customer") {
		const subject = { type: target.kind === "unit" ? "equipment" : "location", id: target.id };
		if (!(await mayReadIn(target.organizationId, asking, subject))) return undefined;
	}
	return { target, viewer: asking.audience };
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
