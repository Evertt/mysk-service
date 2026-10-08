/** The mail the app under test sent, which it writes to a file instead of sending. */
import { existsSync, readFileSync } from "node:fs";

import { lane } from "./lane.ts";

export interface SentMail {
	from: string;
	to: string;
	subject: string;
	text: string;
	html?: string;
}

/** The mail the app sent to `to` (instead of sending it, see `MAIL_OUTBOX`), oldest first. */
export function sentMail(to: string): SentMail[] {
	if (!existsSync(lane.outbox)) return [];
	return readFileSync(lane.outbox, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as SentMail)
		.filter((mail) => mail.to === to);
}

/** The first link to the app in the latest mail to `to`, e.g. an invitation's. */
export function linkInMail(to: string) {
	const mail = sentMail(to).at(-1);
	const link = mail?.text.match(/https?:\/\/\S+/)?.[0];
	if (!link) throw new Error(`No mail with a link was sent to ${to}`);
	return link;
}
