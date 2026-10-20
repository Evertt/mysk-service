/**
 * When a page's live-query streams close after a client-side navigation away from it (#14 in
 * `../README.md`). Runs as an e2e test from `src/tests/e2e/` (copy it there):
 *
 *     PROBE_OUT=order-unit-back.json PROBE_OUT2=distinct-orders.json \
 *       lockf -k /tmp/mysk-service-tests.lock pnpm exec vp test run --project e2e <this file>
 *
 * It tracks each `text/event-stream` fetch without touching its body's data (no `clone()`, whose
 * tee would keep the source alive): open once its headers came, closed on its signal's abort or its
 * reader's end. `waitingFetches` are fetches still waiting for their headers. A garbage collection
 * is forced through CDP (`HeapProfiler.collectGarbage`).
 */
import { writeFileSync } from "node:fs";

import type { Page } from "playwright";
import { expect, test } from "vite-plus/test";

import { organizations, quiet, rows, users, useApp } from "#e2e/app.ts";

const app = useApp({ user: users.shltrPlanner });

type Stream = { url: string; opened: number; closed?: number; how?: string };

async function track(page: Page) {
	await page.context().addInitScript(() => {
		if ("liveStreams" in window) return;
		const streams: Stream[] = [];
		Object.assign(window, { liveStreams: streams });
		const original = window.fetch;
		const waiting = new Map<number, string>();
		let n = 0;
		Object.assign(window, { waitingFetches: waiting });
		window.fetch = async (input, init) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			const id = n++;
			waiting.set(
				id,
				decodeURIComponent(url)
					.replace(/^.*\/_app\/remote\//, "")
					.slice(0, 60),
			);
			const response = await original(input, init).finally(() => waiting.delete(id));
			const accept = new Headers(init?.headers).get("accept") ?? "";
			if (!accept.includes("text/event-stream") || !response.body) return response;
			const stream: Stream = { url: decodeURIComponent(url).slice(0, 160), opened: Date.now() };
			streams.push(stream);
			const close = (how: string) => {
				stream.closed ??= Date.now();
				stream.how ??= how;
			};
			init?.signal?.addEventListener("abort", () => close("abort"), { once: true });
			const body = response.body;
			const getReader = body.getReader.bind(body);
			// @ts-expect-error wrapping
			body.getReader = (...args) => {
				const reader = getReader(...args);
				const read = reader.read.bind(reader);
				reader.read = async () => {
					const result = await read().catch((error) => {
						close("error");
						throw error;
					});
					if (result.done) close("done");
					return result;
				};
				return reader;
			};
			return response;
		};
	});
}

const open = (page: Page) =>
	page.evaluate(() =>
		(window as unknown as { liveStreams: Stream[] }).liveStreams
			.filter((s) => s.closed === undefined)
			.map((s) => s.url.replace(/^.*\/_app\/remote\//, "")),
	);

async function collectGarbage(page: Page) {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("HeapProfiler.collectGarbage");
	await cdp.detach();
}

test(
	"order → unit → back: streams before and after a forced GC",
	{ timeout: 120_000 },
	async () => {
		const { page } = app;
		await track(page);
		const [{ number, serial }] = await rows<{ number: string; serial: string }>(
			`select o.number, e.serial_number as serial from "order" o
		 join order_unit u on u.order_id = o.id join equipment e on e.id = u.equipment_id
		 where o.organization_id = ? order by o.id limit 1`,
			[organizations.shltr.id],
		);
		await app.go(`/orders/${number}`);
		await quiet(page);
		const log: Record<string, unknown> = { number, serial, onOrder: await open(page) };

		await page.locator(`a[href="/equipment/${serial}"]`).first().click();
		await page.waitForURL(`**/equipment/${serial}`);
		await quiet(page);
		await page.waitForTimeout(3_000);
		log.onUnit3s = await open(page);
		await collectGarbage(page);
		await page.waitForTimeout(500);
		log.onUnitAfterGc = await open(page);

		await page.goBack();
		await page.waitForURL(`**/orders/${number}`);
		await quiet(page);
		await page.waitForTimeout(3_000);
		log.backOnOrder3s = await open(page);
		await collectGarbage(page);
		await page.waitForTimeout(500);
		log.backOnOrderAfterGc = await open(page);

		// Pile-up: alternate between the two pages without GC.
		for (let i = 0; i < 4; i++) {
			await page.locator(`a[href="/equipment/${serial}"]`).first().click();
			await page.waitForURL(`**/equipment/${serial}`);
			await quiet(page);
			await page.goBack();
			await page.waitForURL(`**/orders/${number}`);
			await quiet(page);
		}
		log.afterLaps = await open(page);
		log.all = await page.evaluate(
			() => (window as unknown as { liveStreams: Stream[] }).liveStreams,
		);
		writeFileSync(process.env.PROBE_OUT ?? "/dev/null", JSON.stringify(log, null, 1));
		expect(true).toBe(true);
	},
);

/** Navigates within the app, as a link on the page would (no new document). */
async function follow(page: Page, path: string) {
	const started = Date.now();
	await page.evaluate((href) => {
		const a = Object.assign(document.createElement("a"), { href });
		document.body.append(a);
		a.click();
		a.remove();
	}, path);
	await page.waitForURL(`**${path}`);
	const url = Date.now() - started;
	await page.waitForTimeout(1_000);
	const waitingAt1s = await page.evaluate(() => [
		...(window as unknown as { waitingFetches: Map<number, string> }).waitingFetches.values(),
	]);
	await quiet(page);
	return { url, quiet: Date.now() - started, waitingAt1s };
}

test("distinct orders without a GC: do streams pile up?", { timeout: 180_000 }, async () => {
	const { page } = app;
	await track(page);
	const numbers = (
		await rows<{ number: string }>(
			`select o.number from "order" o where o.organization_id = ? order by o.id limit 8`,
			[organizations.shltr.id],
		)
	).map((r) => r.number);
	await app.go(`/orders/${numbers[0]}`);
	await quiet(page);
	const laps: unknown[] = [];
	for (const number of numbers.slice(1)) {
		const ms = await follow(page, `/orders/${number}`);
		const openNow = await open(page);
		const pending = await page.evaluate(() => [
			...(window as unknown as { waitingFetches: Map<number, string> }).waitingFetches.values(),
		]);
		laps.push({ number, ms, open: openNow.length, pending });
	}
	await collectGarbage(page);
	await page.waitForTimeout(500);
	const waitingNow = () =>
		page.evaluate(() => [
			...(window as unknown as { waitingFetches: Map<number, string> }).waitingFetches.values(),
		]);
	laps.push({ afterGc: await open(page), waiting: await waitingNow() });
	await page.waitForTimeout(5_000);
	laps.push({
		gc5s: await open(page),
		waiting: await waitingNow(),
		heading: await page.locator("h1").allInnerTexts(),
		url: page.url(),
	});
	await collectGarbage(page);
	await page.waitForTimeout(2_000);
	laps.push({
		gcAgain: await open(page),
		waiting: await waitingNow(),
		heading: await page.locator("h1").allInnerTexts(),
	});
	writeFileSync(process.env.PROBE_OUT2 ?? "/dev/null", JSON.stringify(laps, null, 1));
	expect(true).toBe(true);
});
