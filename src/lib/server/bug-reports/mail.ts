/**
 * The mail about a new bug report, to `BUG_REPORT_EMAIL`: who, where, their note, the context and
 * the console's errors, and the link to the replay page. In the reporter's language: it's sent
 * while they send the report.
 */
import { contextLines } from "#lib/bug-reports/context-lines.ts";
import type { ReportContext } from "#lib/bug-reports/report.ts";
import { formatStopwatch } from "#lib/i18n/format.ts";
import { escapeHtml, type Mail } from "#lib/server/mail/index.ts";

export interface ReportedBug {
	user: string;
	note: string;
	durationMs: number;
	context: ReportContext;
	/** The console's errors and warnings, as text. */
	errors: string[];
	/** The replay page. */
	url: string;
}

export function bugReportMail(to: string, bug: ReportedBug): Mail {
	const { user, note, context } = bug;
	const organization = context.organization.name;
	const firstLine = note.split("\n")[0].trim();
	const subject = firstLine
		? m.bugs_mail_subject({ user, organization, note: firstLine.slice(0, 120) })
		: m.bugs_mail_subject_without_note({ user, organization });
	const intro = m.bugs_mail_intro({
		user,
		organization,
		duration: formatStopwatch(bug.durationMs),
	});
	const lines = contextLines(user, context);
	const text = [
		intro,
		"",
		...(note ? [m.bugs_mail_note(), note] : [m.bugs_mail_no_note()]),
		"",
		`${m.bugs_mail_watch()}: ${bug.url}`,
		"",
		`${m.bugs_mail_context()}:`,
		...lines.map(([label, value]) => `- ${label}: ${value}`),
		"",
		`${m.bugs_mail_console()}:`,
		...(bug.errors.length ? bug.errors.map((error) => `- ${error}`) : [m.bugs_mail_no_console()]),
	].join("\n");
	const html = [
		`<p>${escapeHtml(intro)}</p>`,
		note
			? `<p>${escapeHtml(m.bugs_mail_note())}</p><blockquote>${escapeHtml(note).replaceAll("\n", "<br>")}</blockquote>`
			: `<p>${escapeHtml(m.bugs_mail_no_note())}</p>`,
		`<p><a href="${escapeHtml(bug.url)}">${escapeHtml(m.bugs_mail_watch())}</a></p>`,
		`<h3>${escapeHtml(m.bugs_mail_context())}</h3>`,
		`<ul>${lines.map(([label, value]) => `<li>${escapeHtml(label)}: ${escapeHtml(value)}</li>`).join("")}</ul>`,
		`<h3>${escapeHtml(m.bugs_mail_console())}</h3>`,
		bug.errors.length
			? `<ul>${bug.errors.map((error) => `<li><code>${escapeHtml(error)}</code></li>`).join("")}</ul>`
			: `<p>${escapeHtml(m.bugs_mail_no_console())}</p>`,
	].join("\n");
	return { to, subject, text, html };
}
