import { describe, expect, test } from "vite-plus/test";

import {
	mobileViewport,
	organizations,
	rows,
	unbalancedStock,
	useApp,
	users,
	value,
} from "#e2e/app.ts";

const { north } = organizations;
const app = useApp({ user: users.engineer, viewport: mobileViewport });

/** The engineer the field engineer's account is linked to. */
const me = async () =>
	(
		await rows<{ id: number; user_id: string }>(
			`select e.id, e.user_id from engineer e join user u on u.id = e.user_id
			 where u.email = ? and e.organization_id = ?`,
			[users.engineer, north.id],
		)
	)[0];
const movements = (number: string) =>
	rows<{ material_id: number; quantity: number; kind: string }>(
		`select material_id, quantity, kind from stock_movement
		 where order_number = ? and organization_id = ? order by id`,
		[number, north.id],
	);
const stockOf = (materialId: number) =>
	value<number>(`select stock from material where id = ?`, [materialId]);
const lineCount = (orderId: number) =>
	value<number>(`select count(*) from order_line where order_id = ?`, [orderId]);

/**
 * The materials card on the engineer portal's order page (`portal.order`): what they used on a job,
 * which they change while it's in progress, taking or returning stock like the office's order form.
 */
describe("the engineer portal's materials card", () => {
	let job: { id: number; number: string };

	test("a job that hasn't started shows its materials, without a form", async () => {
		const { page } = app;
		// Their latest scheduled job: the portal's own e2e works on their first.
		[job] = await rows<{ id: number; number: string }>(
			`select id, number from "order" where engineer_id = ? and status = 'scheduled'
			 order by scheduled_for desc limit 1`,
			[(await me()).id],
		);
		await app.go(`/my/${job.number}`);
		const card = page.locator('[data-slot="card"]', { hasText: "Materials" }).first();
		await card.waitFor();
		expect(await card.getByRole("button", { name: "Save materials" }).count()).toBe(0);
	});

	test("once started, a material used comes out of stock, the same way as in the office", async () => {
		const { page } = app;
		await page.getByRole("button", { name: "Start job" }).click();
		await app.toast("Job started");
		await page.getByRole("button", { name: "Add material" }).waitFor();

		const [part] = await rows<{ id: number; name: string; stock: number }>(
			`select id, name, stock from material where organization_id = ? and unit = 'pcs'
			 and stock >= 3 and id not in (select material_id from order_line where order_id = ?)
			 order by id limit 1`,
			[north.id, job.id],
		);
		const before = await movements(job.number);
		const lines = await lineCount(job.id);
		await page.getByRole("button", { name: "Add material" }).click();
		const line = page.locator("[data-line]").last();
		await line.getByLabel("Material", { exact: true }).selectOption(String(part.id));
		await line.getByLabel("Quantity").fill("2");
		await page.getByRole("button", { name: "Save materials" }).click();
		await app.toast("Materials saved");

		expect(await lineCount(job.id)).toBe(lines + 1);
		expect(
			await value(`select quantity from order_line where order_id = ? and material_id = ?`, [
				job.id,
				part.id,
			]),
		).toBe(2);
		expect((await movements(job.number)).slice(before.length)).toEqual([
			{ material_id: part.id, quantity: -2, kind: "consumption" },
		]);
		expect(await stockOf(part.id)).toBe(part.stock - 2);
		expect(await unbalancedStock(north.id)).toEqual([]);

		// More than there is is refused on the line, naming what's available, and changes nothing.
		await line.getByLabel("Quantity").fill(String(part.stock + 5));
		await app.submit(page.getByRole("button", { name: "Save materials" }));
		expect(await app.issues()).toEqual([`Only ${part.stock} pcs of ${part.name} in stock`]);
		expect(await stockOf(part.id)).toBe(part.stock - 2);
		expect((await movements(job.number)).slice(before.length)).toHaveLength(1);
	});

	test("the line is logged against the order, by them", async () => {
		const engineer = await me();
		const [entry] = await rows<{ user_id: string; action: string; changes: string }>(
			`select user_id, action, changes from activity where organization_id = ?
			 and subject_type = 'order_line' and parent_type = 'order' and parent_id = ?
			 order by id desc limit 1`,
			[north.id, String(job.id)],
		);
		expect(entry).toMatchObject({ user_id: engineer.user_id, action: "created" });
		expect(JSON.parse(entry.changes)).toEqual({ quantity: [null, 2] });
	});
});
