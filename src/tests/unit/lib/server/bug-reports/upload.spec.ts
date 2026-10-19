/**
 * The bug reports' server side: the upload (`POST /bug-reports`) and its gate and limits, where it
 * stores a report and whom it mails, and the developers' pages (`forDevelopers`), which no one
 * else, not even the reporting tenant's members, may read.
 */
import { gunzipSync, gzipSync } from "node:zlib";

import { isHttpError, type RequestEvent } from "@sveltejs/kit";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { maxReportBytes, type ReportSummary } from "#lib/bug-reports/report.ts";
import type { Mail } from "#lib/server/mail/index.ts";
import { GET as getRecording } from "#routes/(ops)/ops/bug-reports/[id]/recording/+server.ts";
import { getBugReport, getBugReports } from "#routes/(ops)/ops/bug-reports/bug-reports.remote.ts";
import { POST } from "#routes/bug-reports/+server.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import {
	as,
	call,
	north,
	organizationId,
	rows,
	shltr,
	signedOut,
	south,
} from "#unit/lib/server/harness/index.ts";

const settings = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return {
		email: "bugs@fieldworks.test" as string | undefined,
		folder: fs.mkdtempSync(path.join(os.tmpdir(), "bug-reports-upload-")),
		developers: [] as string[],
	};
});
vi.mock("#lib/server/bug-reports/settings.ts", () => ({ bugReportSettings: settings }));

const mailed = vi.hoisted(() => [] as Mail[]);
vi.mock("#lib/server/mail/index.ts", async (importOriginal) => ({
	...(await importOriginal<object>()),
	sendMail: async (mail: Mail) => void mailed.push(mail),
}));

afterAll(async () => {
	const { rmSync } = await import("node:fs");
	rmSync(settings.folder, { recursive: true, force: true });
});

beforeEach(() => {
	mailed.length = 0;
	// Marloes of SHLTR, who isn't a member of North or South.
	settings.developers = [shltr.owner.email.toLowerCase()];
});

const summary: ReportSummary = {
	note: "The list stayed empty\nafter I saved",
	startedAt: Date.parse("2026-10-19T09:00:00Z"),
	durationMs: 42_000,
	context: {
		url: "http://localhost/orders",
		routeId: "/(app)/orders",
		version: "1760000000000",
		viewport: { width: 1280, height: 800, pixelRatio: 2 },
		userAgent: "Test/1.0",
		locale: "en",
		languages: ["en"],
		timeZone: "Europe/Amsterdam",
		theme: "lagoon",
		mode: "light",
		dark: false,
		density: "comfortable",
		online: true,
	},
	errors: ["error: Cannot read properties of undefined (reading 'id')"],
};

const events = [{ type: 4, timestamp: summary.startedAt, data: { href: summary.context.url } }];

/** A report's request as the recorder sends it, with `report` and `recording` instead if given. */
async function reportRequest({
	report = JSON.stringify(summary) as string,
	recording = new Uint8Array(gzipSync(JSON.stringify(events))),
	length,
}: { report?: string; recording?: Uint8Array<ArrayBuffer>; length?: string | null } = {}) {
	const form = new FormData();
	form.set("report", report);
	form.set("events", new Blob([recording]), "events.json.gz");
	const encoded = new Response(form);
	const body = await encoded.arrayBuffer();
	const headers = new Headers({ "content-type": encoded.headers.get("content-type")! });
	if (length !== null) headers.set("content-length", length ?? String(body.byteLength));
	return new Request("http://localhost/bug-reports", { method: "POST", headers, body });
}

/** The answer to `request` as `actor` (signed out if `null`): its status, and its body. */
async function upload(actor: Actor | null, request: Request) {
	const run = async () => {
		try {
			const response = await POST({ request } as RequestEvent);
			return { status: response.status, body: (await response.json()) as unknown };
		} catch (error) {
			if (isHttpError(error)) return { status: error.status, body: error.body as unknown };
			throw error;
		}
	};
	return actor ? as(actor, run) : signedOut(run);
}

/** The recording's GET as `actor`: its status, and its bytes. */
async function recordingOf(actor: Actor, id: string) {
	return as(actor, async () => {
		try {
			const response = await getRecording({ params: { id } } as unknown as RequestEvent);
			return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()) };
		} catch (error) {
			if (isHttpError(error)) return { status: error.status, bytes: null };
			throw error;
		}
	});
}

const reportRows = () =>
	rows<Record<string, unknown>>("select * from bug_report order by created_at, id");

describe("the upload", () => {
	test("stores a planner's report under their own tenant, whatever the body says", async () => {
		const report = JSON.stringify({
			...summary,
			organizationId: organizationId("south"),
			userId: "someone-else",
			context: { ...summary.context, organization: { name: "Zuid", slug: "south" } },
		});
		const answer = await upload(north.member, await reportRequest({ report }));
		expect(answer.status).toBe(201);
		const { id } = answer.body as { id: string };

		const [row] = (await reportRows()).filter((candidate) => candidate.id === id);
		const [planner] = await rows<{ id: string; name: string }>(
			"select id, name from user where email = ?",
			[north.member.email],
		);
		expect(row).toMatchObject({
			organization_id: organizationId("north"),
			user_id: planner.id,
			user_name: planner.name,
			url: "http://localhost/orders",
			route_id: "/(app)/orders",
			note: "The list stayed empty\nafter I saved",
			user_agent: "Test/1.0",
			app_version: "1760000000000",
			started_at: summary.startedAt,
			duration_ms: 42_000,
		});
		expect(row.object_key).toMatch(new RegExp(`^\\d{4}/\\d{2}/${id}\\.json\\.gz$`));
		const context = JSON.parse(String(row.context));
		expect(context.organization.slug).not.toBe("south");
		expect(context).toMatchObject({ roles: ["member"], theme: "lagoon" });
		expect(context.modules.length).toBeGreaterThan(0);

		// The developer gets the recording back as it was sent.
		const recording = await recordingOf(shltr.owner, id);
		expect(recording.status).toBe(200);
		expect(JSON.parse(gunzipSync(recording.bytes!).toString())).toEqual(events);
	});

	test("mails BUG_REPORT_EMAIL, with the note, the context, the errors and the replay's link", async () => {
		const answer = await upload(north.member, await reportRequest());
		const { id } = answer.body as { id: string };
		expect(mailed).toHaveLength(1);
		const [mail] = mailed;
		expect(mail.to).toBe("bugs@fieldworks.test");
		expect(mail.subject).toMatch(/^Bug report from .+ at .+: The list stayed empty$/);
		expect(mail.text).toContain("after I saved");
		expect(mail.text).toContain(`/ops/bug-reports/${id}`);
		expect(mail.text).toContain("Cannot read properties of undefined");
		expect(mail.text).toContain("- Page: http://localhost/orders");
	});

	test("takes an engineer's report from the portal", async () => {
		const answer = await upload(north.engineer, await reportRequest());
		expect(answer.status).toBe(201);
	});

	test("refuses signed-out visitors and customers' contacts", async () => {
		const before = (await reportRows()).length;
		expect((await upload(null, await reportRequest())).status).toBe(401);
		expect((await upload(north.customer, await reportRequest())).status).toBe(403);
		expect((await upload(south.customer, await reportRequest())).status).toBe(403);
		expect(await reportRows()).toHaveLength(before);
		expect(mailed).toEqual([]);
	});

	test("refuses a body over the limit by its length, before reading it", async () => {
		const request = await reportRequest({ length: String(maxReportBytes + 1024 * 1024) });
		expect((await upload(north.member, request)).status).toBe(413);
		expect(request.bodyUsed).toBe(false);
		expect((await upload(north.member, await reportRequest({ length: null }))).status).toBe(411);
	});

	test("refuses a recording over the limit", async () => {
		const recording = new Uint8Array(maxReportBytes + 1);
		recording.set([0x1f, 0x8b]);
		expect((await upload(north.member, await reportRequest({ recording }))).status).toBe(413);
	});

	test("refuses what isn't a report", async () => {
		const bad = [
			await reportRequest({ report: "not json" }),
			await reportRequest({ report: JSON.stringify({ ...summary, context: {} }) }),
			await reportRequest({ recording: new TextEncoder().encode("[]") }),
		];
		for (const request of bad) expect((await upload(north.member, request)).status).toBe(400);
	});
});

describe("the developers' pages", () => {
	test("list and open the reports of every tenant", async () => {
		const sent = await upload(south.owner, await reportRequest());
		const { id } = sent.body as { id: string };
		const list = await as(shltr.owner, () => call(getBugReports));
		expect(list.status).toBe(200);
		expect(list.data?.[0]).toMatchObject({ id, path: "/orders", note: summary.note });
		const report = await as(shltr.owner, () => call(getBugReport, id));
		expect(report.data).toMatchObject({ id, durationMs: 42_000 });
	});

	test("are a 404 for everyone else, the reporting tenant's members too", async () => {
		const sent = await upload(north.member, await reportRequest());
		const { id } = sent.body as { id: string };
		for (const actor of [north.owner, north.member, south.owner]) {
			expect(await as(actor, () => call(getBugReports))).toMatchObject({ status: 404 });
			expect(await as(actor, () => call(getBugReport, id))).toMatchObject({ status: 404 });
			expect((await recordingOf(actor, id)).status).toBe(404);
		}
		expect(await signedOut(() => call(getBugReports))).toMatchObject({ status: 401 });
	});

	test("are a 404 for an id that isn't a report's", async () => {
		expect(await as(shltr.owner, () => call(getBugReport, "nothing"))).toMatchObject({
			status: 404,
		});
		expect((await recordingOf(shltr.owner, "nothing")).status).toBe(404);
	});
});
