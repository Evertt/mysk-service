// Logs the requests and console while deleting a unit of equipment from its page, with the browser
// slowed down. Ran as `src/tests/e2e/zz-scratch-slot.test.ts` (`vp test run --project e2e …`); writes the log
// to `trace.log` next to it. Before the workaround, revert `delete-dialog.svelte` to `<form {...form}>`.
import { writeFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

import { useApp } from "#e2e/app.ts";

const app = useApp();

test("deleting a unit from its page, with a slow browser", async () => {
	const { page } = app;
	const log: string[] = [];
	const t0 = Date.now();
	const at = () => `${Date.now() - t0}ms`;
	page.on("console", (m) => log.push(`${at()} console.${m.type()}: ${m.text().slice(0, 160)}`));
	page.on("request", (r) => {
		if (r.url().includes("/_app/remote/"))
			log.push(`${at()} ${r.method()} ${new URL(r.url()).pathname.split("/").pop()}`);
	});
	page.on("framenavigated", (f) => f === page.mainFrame() && log.push(`${at()} nav ${f.url()}`));
	const cdp = await page.context().newCDPSession(page);
	let failures = 0;
	try {
		for (let i = 0; i < 4; i++) {
			const serial = `ZZ-SLOT-${i}`;
			await app.go("/equipment/new");
			await page.getByLabel("Serial number").fill(serial);
			await page.getByLabel("Manufacturer").fill("Testco");
			await page.getByLabel("Model").fill("TX-1");
			await page.getByLabel("Category").selectOption("chiller");
			await page.getByLabel("Customer").selectOption({ index: 1 });
			await page.getByLabel("Installed on").fill("2026-01-10");
			await page.getByLabel("Warranty until").fill("2029-01-10");
			await page.getByRole("button", { name: "Register equipment" }).click();
			await page.waitForURL((url) => url.pathname === `/equipment/${serial}`);
			await page.getByRole("heading", { name: "Testco TX-1" }).waitFor();
			await page.waitForLoadState("networkidle");
			log.push(`--- ${serial}: delete`);
			const before = log.length;
			await cdp.send("Emulation.setCPUThrottlingRate", { rate: 8 });
			await app.expectingErrors(async () => {
				await page.getByRole("button", { name: "Delete" }).click();
				await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
				await page.waitForURL((url) => url.pathname === "/equipment");
				await page.waitForTimeout(3000);
			});
			await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
			if (log.slice(before).some((line) => line.includes("contribution failed"))) failures++;
		}
	} finally {
		writeFileSync(
			new URL("trace.log", import.meta.url),
			`${log.join("\n")}\nfailures: ${failures}\n`,
		);
	}
	expect(true).toBe(true);
}, 300_000);
