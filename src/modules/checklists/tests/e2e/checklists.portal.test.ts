/**
 * The checklists in the engineer portal, on a phone: Lev fills in each unit's checklist of one of
 * his inspection orders (each answer saved as he goes), completes them, and only then the order,
 * with his signature and the customer's; the office prints its work order. What the server does
 * with each answer and completion (who may change which checklist, its validity, what's logged,
 * another tenant's ids refused) is `portal.spec.ts`'s and `checklists.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	baseURL,
	fitsWidth,
	hydrated,
	mobileViewport,
	organizations,
	rows,
	useApp,
	users,
	value,
} from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

import { checklistsOfOrder, engineerOf, resultsOf, sign } from "./helpers.ts";

const shltr = organizations.shltr;
const app = useApp({ user: users.shltrEngineer, viewport: mobileViewport });
const page = () => app.page;

/** A unit's checklist card in the portal, by its serial number. */
const card = (serial: string) => page().locator(`[data-field-checklist="${serial}"]`);
/** A point of a card, by its text. */
const point = (serial: string, text: string) =>
	card(serial).locator(`[data-point="${text.replaceAll('"', '\\"')}"]`);

describe("Lev's inspection order", () => {
	let job: { id: number; number: string };
	let lev: number;

	test("has a checklist per unit with a template, to fill in once the job's started", async () => {
		lev = await engineerOf(users.shltrEngineer, shltr.id);
		// The one with the fewest points to answer.
		[job] = await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o where o.engineer_id = ? and o.status = 'scheduled'
			 and o.type = 'inspection' and exists (select 1 from checklist c where c.order_id = o.id)
			 order by (select count(*) from checklist_result r join checklist c on c.id = r.checklist_id
				where c.order_id = o.id), o.scheduled_for limit 1`,
			[lev],
		);
		expect(job, "Lev has a planned inspection with checklists").toBeDefined();
		const checklists = await checklistsOfOrder(job.id);
		await app.go(`/my/${job.number}`);
		const section = page().locator("[data-field-checklists]");
		await section.waitFor();
		// Before the job's started, they show what's on them, to read.
		expect(await section.getByRole("button", { name: "Complete checklist" }).count()).toBe(0);
		await page().getByRole("button", { name: "Start job" }).click();
		await section.getByRole("button", { name: "Complete checklist" }).first().waitFor();
		expect(await section.getByRole("button", { name: "Complete checklist" }).count()).toBe(
			checklists.length,
		);
		for (const checklist of checklists) {
			const points = await resultsOf(checklist.id);
			await expect
				.poll(() => card(checklist.serial_number).innerText())
				.toContain(`0/${points.length} points`);
			// Three big buttons per point.
			expect(await card(checklist.serial_number).getByRole("button", { name: "OK" }).count()).toBe(
				points.length,
			);
		}
		expect(await fitsWidth(page())).toBe(true);
	});

	test("each answer is saved as it's given, and is still there after a reload", async () => {
		const [first] = await checklistsOfOrder(job.id);
		const [a, b] = await resultsOf(first.id);
		await point(first.serial_number, a.text).getByRole("button", { name: "Reject" }).click();
		await point(first.serial_number, b.text).getByRole("button", { name: "OK" }).click();
		const remark = point(first.serial_number, a.text).getByRole("textbox");
		await remark.fill("Draadbreuk zichtbaar bij trommel — kabelset meenemen.");
		await remark.blur();
		await expect
			.poll(async () => (await resultsOf(first.id)).slice(0, 2).map((p) => [p.result, p.remark]))
			.toEqual([
				["nok", "Draadbreuk zichtbaar bij trommel — kabelset meenemen."],
				["ok", null],
			]);
		await card(first.serial_number).getByText("2/").waitFor();

		await app.go(`/my/${job.number}`);
		const rejected = point(first.serial_number, a.text).getByRole("button", { name: "Reject" });
		await rejected.waitFor();
		expect(await rejected.getAttribute("aria-pressed")).toBe("true");
		expect(await point(first.serial_number, a.text).getByRole("textbox").inputValue()).toBe(
			"Draadbreuk zichtbaar bij trommel — kabelset meenemen.",
		);
	});

	test("the order and a checklist complete only once every point is answered, a rejection saying what's wrong", async () => {
		await sign(page(), page().getByLabel("Engineer's signature"));
		await page().getByLabel("Signed by").fill("M. Verhoeven");
		await sign(page(), page().getByLabel("Signature", { exact: true }));
		await app.submit(page().getByRole("button", { name: "Complete job" }));
		const issues = (await app.issues()).join(" ");
		expect(issues).toMatch(new RegExp(`${job.number} can't be completed yet: the checklists? of`));

		const checklists = await checklistsOfOrder(job.id);
		const [first] = checklists;
		const points = await resultsOf(first.id);
		for (const each of points.slice(0, -1)) {
			if (each.result) continue;
			await point(first.serial_number, each.text).getByRole("button", { name: "OK" }).click();
		}
		const last = points.at(-1)!;
		// A rejection without a remark keeps it open.
		await point(first.serial_number, last.text).getByRole("button", { name: "Reject" }).click();
		await card(first.serial_number).getByRole("button", { name: "Complete checklist" }).click();
		await card(first.serial_number)
			.getByText("1 rejected point doesn't say what's wrong.")
			.waitFor();
		expect((await checklistsOfOrder(job.id))[0].status).toBe("draft");
		await point(first.serial_number, last.text).getByRole("button", { name: "OK" }).click();

		for (const checklist of checklists) {
			for (const each of await resultsOf(checklist.id)) {
				if (each.result) continue;
				await point(checklist.serial_number, each.text).getByRole("button", { name: "OK" }).click();
			}
			await card(checklist.serial_number)
				.getByRole("button", { name: "Complete checklist" })
				.click();
			await card(checklist.serial_number).locator("[data-outcome]").waitFor();
		}
		expect(await card(first.serial_number).locator("[data-outcome]").innerText()).toBe(
			"1 rejected",
		);
		// What was found, to read: the rejection and what's wrong.
		expect(await card(first.serial_number).innerText()).toContain(
			"Draadbreuk zichtbaar bij trommel — kabelset meenemen.",
		);
	});

	test("then the order completes with Lev's signature and the customer's", async () => {
		await app.go(`/my/${job.number}`);
		await sign(page(), page().getByLabel("Engineer's signature"));
		await page().getByLabel("Signed by").fill("M. Verhoeven");
		await sign(page(), page().getByLabel("Signature", { exact: true }));
		await page().getByRole("button", { name: "Complete job" }).click();
		await app.toast("Job completed");
		expect(await value(`select status from "order" where id = ?`, [job.id])).toBe("completed");
		const [signoff] = await rows<{
			signer_name: string;
			signature: string;
			engineer_name: string;
			engineer_signature: string;
		}>(
			`select signer_name, signature, engineer_name, engineer_signature from order_signoff
			 where order_id = ?`,
			[job.id],
		);
		expect(signoff).toMatchObject({ signer_name: "M. Verhoeven", engineer_name: "Lev Hoekstra" });
		expect(signoff.signature).toMatch(/^data:image\/png;base64,/);
		expect(signoff.engineer_signature).toMatch(/^data:image\/png;base64,/);
		await page().getByText("Engineer: Lev Hoekstra").waitFor();
	});

	test("the office prints the work order, with every checklist and both signatures", async () => {
		const { page: office } = await signedInPage(app, users.shltrPlanner);
		try {
			await office.goto(`${baseURL}/orders/${job.number}`);
			await hydrated(office);
			await office
				.locator("[data-order-checklists]")
				.getByRole("link", { name: "Work order" })
				.click();
			await office.waitForURL((url) => url.pathname === `/checklists/work-orders/${job.number}`);
			const workOrder = office.locator(`[data-work-order="${job.number}"]`);
			await workOrder.waitFor();
			const checklists = await checklistsOfOrder(job.id);
			expect(await workOrder.locator("section[data-checklist]").count()).toBe(checklists.length);
			for (const who of ["engineer", "customer"]) {
				const src = await workOrder.locator(`[data-signature="${who}"] img`).getAttribute("src");
				expect(src, who).toMatch(/^data:image\/png;base64,/);
			}
			const text = await workOrder.innerText();
			expect(text).toContain("Lev Hoekstra");
			expect(text).toContain("M. Verhoeven");
			expect(text).toContain("Draadbreuk zichtbaar bij trommel — kabelset meenemen.");
			// On paper: the work order alone, without the app's sidebar and header.
			await office.emulateMedia({ media: "print" });
			expect(await office.locator('[data-slot="app-header"]').isVisible()).toBe(false);
			expect(await office.getByRole("button", { name: "Print" }).isVisible()).toBe(false);
			expect(await workOrder.isVisible()).toBe(true);
		} finally {
			await office.context().close();
		}
	});
});
