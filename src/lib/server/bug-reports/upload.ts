/**
 * Receives a bug report from the recorder (`POST /bug-reports`, `src/routes/bug-reports/+server.ts`):
 * a form with the gzipped recording (`events`) and its summary (`report`, JSON). Stores the
 * recording, adds its row, then mails `BUG_REPORT_EMAIL`.
 */
import { ORIGIN } from "$app/env/private";
import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

import { isCustomerContact } from "#lib/auth/index.ts";
import {
	maxReportBytes,
	type ReportContext,
	reportSummarySchema,
} from "#lib/bug-reports/report.ts";
import { numberFormatter } from "#lib/i18n/format.ts";
import { requireTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { bugReport } from "#lib/server/db/schema.ts";
import { sendMail } from "#lib/server/mail/index.ts";

import { bugReportMail } from "./mail.ts";
import { bugReportSettings } from "./settings.ts";
import { bugReportStore, objectKey } from "./storage.ts";

/** Room in a request for the summary and the form's own parts, besides the recording. */
const formAllowance = 256 * 1024;

const megabytes = numberFormatter({ style: "unit", unit: "megabyte", maximumFractionDigits: 0 });
function tooLarge(): never {
	error(413, m.bugs_error_too_large({ size: megabytes(maxReportBytes / 2 ** 20) }));
}

function malformed(): never {
	error(400, m.bugs_error_invalid());
}

/**
 * Who may send a bug report: a signed-in member of an organization, of the office or a field
 * engineer, but not a customer's contact (the customer portal has no record button). A 401 or 403
 * otherwise.
 */
function requireReporter() {
	const tenant = requireTenant();
	if (isCustomerContact(tenant.roles)) error(403, m.common_error_no_permission());
	return tenant;
}

/** The JSON in `text`, or `undefined` if it isn't any. */
function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * Takes the report in `request`, stores it under the reporter's own tenant and user (whatever the
 * body says), and answers its id (201). Refuses a request without a `Content-Length` (411), one
 * larger than `maxReportBytes` (413) before reading it, and a body that isn't a report (400).
 */
export async function receiveBugReport(request: Request) {
	const tenant = requireReporter();
	const length = request.headers.get("content-length");
	if (length === null) error(411, m.bugs_error_length_required());
	if (!(Number(length) <= maxReportBytes + formAllowance)) tooLarge();

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		malformed();
	}
	const events = form.get("events");
	const report = form.get("report");
	if (!(events instanceof File) || typeof report !== "string") malformed();
	if (events.size > maxReportBytes) tooLarge();
	const parsed = v.safeParse(reportSummarySchema, parseJson(report));
	if (!parsed.success) malformed();
	const summary = parsed.output;
	const data = new Uint8Array(await events.arrayBuffer());
	// gzip's magic number: the recording as the recorder packs it.
	if (data[0] !== 0x1f || data[1] !== 0x8b) malformed();

	const id = crypto.randomUUID();
	const createdAt = Temporal.Now.instant();
	const key = objectKey(id, createdAt);
	const context: ReportContext = {
		...summary.context,
		organization: { name: tenant.name, slug: tenant.slug },
		roles: tenant.roles,
		modules: tenant.modules,
	};
	// The recording first: a row always has one (a recording without a row, if the insert fails,
	// is only clutter).
	await bugReportStore().put(key, data);
	await db.insert(bugReport).values({
		id,
		organizationId: tenant.organizationId,
		userId: tenant.user.id,
		userName: tenant.user.name,
		url: context.url,
		routeId: context.routeId,
		note: summary.note,
		userAgent: context.userAgent,
		appVersion: context.version,
		context,
		startedAt: Temporal.Instant.fromEpochMilliseconds(summary.startedAt),
		durationMs: summary.durationMs,
		size: data.byteLength,
		objectKey: key,
		createdAt,
	});

	// After the row is in, outside any transaction: on Cloudflare one holds every other request.
	const origin = ORIGIN || getRequestEvent().url.origin;
	const mail = bugReportMail(bugReportSettings.email ?? "", {
		user: tenant.user.name,
		note: summary.note,
		durationMs: summary.durationMs,
		context,
		errors: summary.errors,
		url: new URL(`/ops/bug-reports/${id}`, origin).href,
	});
	try {
		if (bugReportSettings.email) await sendMail(mail);
		else
			console.info(
				`[bug report] BUG_REPORT_EMAIL isn't set, so this wasn't sent:\n${mail.subject}\n\n${mail.text}\n`,
			);
	} catch (cause) {
		// The report is in: a mail that fails doesn't fail it.
		console.error("[bug report] The mail about it couldn't be sent", cause);
	}
	return Response.json({ id }, { status: 201 });
}
