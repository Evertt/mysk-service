import { redirect, type RequestHandler } from "@sveltejs/kit";

import { loginUrl } from "#lib/auth/index.ts";
import { qrDestination, resolveQrCode } from "#lib/equipment/server/index.ts";
import { auth } from "#lib/server/auth/index.ts";
import { orNotFound } from "#lib/server/records.ts";

/**
 * A scanned QR code of a unit or location (`/q/<token>`, see `#lib/equipment/qr.ts`): leads an
 * office member to its page, a field engineer to it in their portal, and a customer's contact to
 * "report a breakdown" in the customer portal (another customer's code is a 404 for them).
 * Someone signed out is sent to the login first and back here after (`handleGuard` in
 * `hooks.server.ts`). A code of a tenant the user isn't a member of is a 404, as an unknown one
 * is; one of another of their organizations makes that their current one first.
 */
export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) redirect(303, loginUrl(`/q/${params.token}`));
	const found = orNotFound(
		await resolveQrCode(params.token!, locals.user.id),
		m.equipment_qr_not_found(),
	);
	if (locals.tenant?.organizationId !== found.target.organizationId) {
		await auth.api.setActiveOrganization({
			body: { organizationId: found.target.organizationId },
			headers: request.headers,
		});
	}
	redirect(303, qrDestination(found.target, found.viewer));
};
