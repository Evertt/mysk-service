import { error, redirect, type RequestHandler } from "@sveltejs/kit";

import { qrDestination, resolveQrCode } from "#lib/equipment/server/index.ts";
import { auth } from "#lib/server/auth/index.ts";

/**
 * A scanned QR code of a unit or location (`/q/<token>`, see `#lib/equipment/qr.ts`): leads an
 * office member to its page, a field engineer to it in their portal. Someone signed out is sent to
 * the login first and back here after (`handleGuard` in `hooks.server.ts`). A code of a tenant the
 * user isn't a member of is a 404, as an unknown one is; one of another of their organizations
 * makes that their current one first. (The customer portal will lead its customers to "report a
 * breakdown" here.)
 */
export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) redirect(303, `/login?redirectTo=${encodeURIComponent(`/q/${params.token}`)}`);
	const found = await resolveQrCode(params.token!, locals.user.id);
	if (!found) error(404, m.equipment_qr_not_found());
	if (locals.tenant?.organizationId !== found.target.organizationId) {
		await auth.api.setActiveOrganization({
			body: { organizationId: found.target.organizationId },
			headers: request.headers,
		});
	}
	redirect(303, qrDestination(found.target, found.viewer));
};
