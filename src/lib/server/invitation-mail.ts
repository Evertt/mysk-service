import { dateFormatter } from "#lib/format.js";
import { invitedAsText } from "#lib/members.ts";
import { m } from "#lib/paraglide/messages.js";

import type { Mail } from "./mail.ts";

const escape = (text: string) =>
	text.replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
	);

const expiry = dateFormatter({ dateStyle: "long", timeStyle: "short", timeZone: "UTC" });

/**
 * The email inviting someone to an organization, with the link to accept it. In the current
 * language: the inviter's, as it's sent while they invite (their language is all we know).
 */
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
	const as = invitedAsText([role]);
	const until = `${expiry(expiresAt)} (UTC)`;
	return {
		to,
		subject: m.auth_invite_mail_subject({ inviter, organization }),
		text: [
			m.auth_invite_mail_intro({ inviter, organization, role: as }),
			"",
			m.auth_invite_mail_accept_link({ url }),
			"",
			m.auth_invite_mail_until({ until }),
		].join("\n"),
		html: [
			`<p>${m.auth_invite_mail_intro({
				inviter: escape(inviter),
				organization: `<strong>${escape(organization)}</strong>`,
				role: escape(as),
			})}</p>`,
			`<p><a href="${escape(url)}">${escape(m.auth_invite_mail_accept())}</a></p>`,
			`<p>${escape(m.auth_invite_mail_until({ until }))}</p>`,
		].join("\n"),
	};
}
