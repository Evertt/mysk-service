import { dateFormatter } from "#lib/format.js";
import { labelOrValue } from "#lib/i18n/labels.js";

import type { Mail } from "./mail.ts";

const escape = (text: string) =>
	text.replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
	);

const expiry = dateFormatter({ dateStyle: "long", timeStyle: "short", timeZone: "UTC" });

/** The email inviting someone to an organization, with the link to accept it. */
export function invitationMail({
	to,
	organization,
	inviter,
	role,
	url,
	expiresAt,
}: {
	to: string;
	organization: string;
	inviter: string;
	role: string;
	/** The accept-invitation page, `/invite/<id>`. */
	url: string;
	expiresAt: Date;
}): Mail {
	const roleLabel = labelOrValue("memberRole", role).toLowerCase();
	const until = `${expiry(expiresAt)} (UTC)`;
	return {
		to,
		subject: `${inviter} invited you to ${organization} on Fieldworks`,
		text: [
			`${inviter} invited you to join ${organization} on Fieldworks as ${roleLabel === "admin" ? "an" : "a"} ${roleLabel}.`,
			"",
			`Accept the invitation: ${url}`,
			"",
			`The link works until ${until}. If you weren't expecting this, you can ignore this email.`,
		].join("\n"),
		html: [
			`<p>${escape(inviter)} invited you to join <strong>${escape(organization)}</strong> on Fieldworks as ${roleLabel === "admin" ? "an" : "a"} ${escape(roleLabel)}.</p>`,
			`<p><a href="${escape(url)}">Accept the invitation</a></p>`,
			`<p>The link works until ${escape(until)}. If you weren't expecting this, you can ignore this email.</p>`,
		].join("\n"),
	};
}
