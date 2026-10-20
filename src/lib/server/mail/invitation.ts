import { invitedAsText } from "#lib/auth/index.ts";
import { dateFormatter } from "#lib/i18n/index.ts";

import { escapeHtml } from "./html.ts";
import type { Mail } from "./send.ts";

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
				inviter: escapeHtml(inviter),
				organization: `<strong>${escapeHtml(organization)}</strong>`,
				role: escapeHtml(as),
			})}</p>`,
			`<p><a href="${escapeHtml(url)}">${escapeHtml(m.auth_invite_mail_accept())}</a></p>`,
			`<p>${escapeHtml(m.auth_invite_mail_until({ until }))}</p>`,
		].join("\n"),
	};
}
