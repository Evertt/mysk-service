import { ORIGIN } from "$app/env/private";
/**
 * The mail to the customer's contact who reported an order in the portal (`requestOrder()`), one per
 * change they follow: accepted, rejected, planned or moved, the engineer on the way, resolved, or
 * cancelled. The customer portal's bell tells the same changes (the `customer` rules in
 * `#lib/server/notifications/rules.ts`, which `customerUpdate()` mirrors), to every contact who reads
 * the order; the mail goes to the one who reported it, while they still may read it.
 *
 * Sent once the change is committed (`afterCommit()`), never inside the transaction: on Cloudflare
 * a transaction holds every other request. In the language they reported it in.
 */
import { getRequestEvent } from "$app/server";
import { and, eq } from "drizzle-orm";

import { formatDateTime } from "#lib/i18n/index.ts";
import { isDoneOrder, isOpenOrder, type OrderStatus } from "#lib/models.ts";
import { m } from "#lib/paraglide/messages.js";
import { isLocale, type Locale } from "#lib/paraglide/runtime.js";
import { mayRead } from "#lib/server/access/index.ts";
import { viewerIn } from "#lib/server/access/viewer.ts";
import { currentTenant, idInTenant, sameTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { order, orderRequest, user } from "#lib/server/db/schema.ts";
import { afterCommit } from "#lib/server/db/serialize.ts";
import { escapeHtml, type Mail, sendMail } from "#lib/server/mail/index.ts";

import type { OrderVerb } from "../lifecycle.ts";

/** A change of an order that its customer hears of. */
type CustomerUpdate = "accepted" | "rejected" | "planned" | "on_the_way" | "resolved" | "cancelled";

/** A move of an order, as `customerUpdate()` reads it. */
export interface OrderMove {
	/** The transition's verb, or the order form's change (`"form"`). */
	verb: OrderVerb | "form";
	from: OrderStatus;
	to: OrderStatus;
	/** Whether it gave the order another time it's planned for (not none). */
	replanned: boolean;
}

/**
 * What the customer hears of a move, if anything: a planner's decision on their report, the order
 * cancelled, the engineer on the way, the work done (not invoicing's moves between done statuses),
 * or the order planned or moved while it's open. The customer rules say the same of log entries.
 */
export function customerUpdate({ verb, from, to, replanned }: OrderMove): CustomerUpdate | null {
	if (verb === "accept") return "accepted";
	if (verb === "reject") return "rejected";
	if (from === to && !replanned) return null;
	if (to === "cancelled") return from === "cancelled" ? null : "cancelled";
	if (to === "on_the_way") return from === "on_the_way" ? null : "on_the_way";
	if (isDoneOrder(to)) return isDoneOrder(from) ? null : "resolved";
	if ((to === "scheduled" && from !== "scheduled") || (replanned && isOpenOrder(to))) {
		return "planned";
	}
	return null;
}

/**
 * Tells the contact who reported order `orderId` (one of the current tenant's) of `update` by
 * mail, once the running transaction has committed. Nothing for an order made in the office, a
 * contact whose account is gone, or one who may no longer read the order. A mail that fails is
 * logged: the change is made.
 */
export function tellReporter(orderId: number, update: CustomerUpdate) {
	const { organizationId, name: organization } = currentTenant();
	// Read now, in the request.
	const origin = ORIGIN || getRequestEvent().url.origin;
	afterCommit(async () => {
		const mail = await reporterMail({ organizationId, organization, origin, orderId, update });
		if (!mail) return;
		try {
			await sendMail(mail);
		} catch (error) {
			console.error(`The ${update} mail about order ${orderId} wasn't sent:`, error);
		}
	});
}

/** The mail of `update` to the reporter of order `orderId`, if they're to get one. */
async function reporterMail({
	organizationId,
	organization,
	origin,
	orderId,
	update,
}: {
	organizationId: string;
	organization: string;
	origin: string;
	orderId: number;
	update: CustomerUpdate;
}): Promise<Mail | null> {
	const [found] = await db
		.select({
			number: order.number,
			description: order.description,
			scheduledFor: order.scheduledFor,
			userId: orderRequest.userId,
			locale: orderRequest.reporterLocale,
			reason: orderRequest.rejectionReason,
			name: user.name,
			email: user.email,
		})
		.from(order)
		.innerJoin(
			orderRequest,
			and(eq(orderRequest.orderId, order.id), sameTenant(orderRequest, order)),
		)
		.innerJoin(user, eq(user.id, orderRequest.userId))
		.where(idInTenant(order, orderId));
	if (!found?.userId) return null;
	// Still a contact of the customer in the tenant who reads the order (moved to other sites, or
	// their access revoked: no mail).
	const contact = await viewerIn(organizationId, found.userId);
	if (
		contact?.audience !== "customer" ||
		!(await mayRead({ type: "order", id: orderId }, contact))
	) {
		return null;
	}
	const locale: Locale = found.locale && isLocale(found.locale) ? found.locale : "nl";
	const facts = {
		organization,
		number: found.number,
		name: found.name,
		when: found.scheduledFor ? formatDateTime(found.scheduledFor, locale) : "",
		reason: found.reason ?? "",
	};
	const options = { locale };
	const [subject, body] = (
		{
			accepted: [m.client_mail_accepted_subject, m.client_mail_accepted_body],
			rejected: [m.client_mail_rejected_subject, m.client_mail_rejected_body],
			planned: [m.client_mail_planned_subject, m.client_mail_planned_body],
			on_the_way: [m.client_mail_on_the_way_subject, m.client_mail_on_the_way_body],
			resolved: [m.client_mail_resolved_subject, m.client_mail_resolved_body],
			cancelled: [m.client_mail_cancelled_subject, m.client_mail_cancelled_body],
		} as const
	)[update];
	const url = new URL(`/portal/orders/${encodeURIComponent(found.number)}`, origin).href;
	const lines = [
		m.client_mail_greeting(facts, options),
		body(facts, options),
		m.client_mail_about({ description: found.description }, options),
	];
	return {
		to: found.email,
		subject: subject(facts, options),
		text: [...lines, m.client_mail_follow({ url }, options)].join("\n\n"),
		html: [
			...lines.map((line) => `<p>${escapeHtml(line).replaceAll("\n", "<br>")}</p>`),
			`<p><a href="${escapeHtml(url)}">${escapeHtml(m.client_mail_open({}, options))}</a></p>`,
		].join("\n"),
	};
}
