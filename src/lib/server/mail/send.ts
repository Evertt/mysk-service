import { appendFile } from "node:fs/promises";

import { MAIL_FROM, MAIL_OUTBOX, SMTP_URL } from "$app/env/private";
import type { Transporter } from "nodemailer";

export interface Mail {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

let transport: Transporter | undefined;

/**
 * Sends a message, depending on the environment (see "Deploying" in README.md):
 * - `MAIL_OUTBOX` set: appends it to that file as a line of JSON, for the end-to-end tests to read.
 *   It wins over `SMTP_URL`, so tests never send real mail.
 * - `SMTP_URL` set: sends it through that SMTP server.
 * - neither: logs it to the server console, e.g. for local development.
 */
export async function sendMail(mail: Mail) {
	const message = { from: MAIL_FROM, ...mail };
	if (MAIL_OUTBOX) {
		await appendFile(
			MAIL_OUTBOX,
			`${JSON.stringify({ ...message, sentAt: new Date().toISOString() })}\n`,
		);
	} else if (SMTP_URL) {
		if (!transport) {
			// Only loaded when it's used.
			const { createTransport } = await import("nodemailer");
			transport = createTransport(SMTP_URL);
		}
		await transport.sendMail(message);
	} else {
		console.info(
			`[mail] SMTP_URL isn't set, so this wasn't sent:\nFrom: ${message.from}\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`,
		);
	}
}
