/**
 * What the equipment tests share: reading units as stored, and the list's and a unit's page.
 */
import { afresh, type App, organizations, rows, value } from "./app.ts";

const { north, south } = organizations;

export const unit = (id: number) => rows(`select * from equipment where id = ?`, [id]);
export const unitId = (serial: string, organizationId: string) =>
	value<number>(`select id from equipment where serial_number = ? and organization_id = ?`, [
		serial,
		organizationId,
	]);
export const orderCount = (id: number) =>
	value<number>(`select count(*) from "order" where equipment_id = ?`, [id]);

/** An organization's unit with the most orders. */
export async function busiest(organizationId: string) {
	const [found] = await rows<{ id: number; serial: string; orders: number }>(
		`select e.id, e.serial_number as serial, count(o.id) as orders from equipment e
		 join "order" o on o.equipment_id = e.id where e.organization_id = ?
		 group by e.id order by count(o.id) desc, e.id limit 1`,
		[organizationId],
	);
	return found;
}

/** A North unit without orders (so an unscoped delete would remove it) whose serial South lacks. */
export async function northOnly() {
	const [found] = await rows<{ id: number; serial: string }>(
		`select id, serial_number as serial from equipment e where organization_id = ?
		 and not exists (select 1 from "order" o where o.equipment_id = e.id)
		 and serial_number not in (select serial_number from equipment where organization_id = ?)
		 order by id limit 1`,
		[north.id, south.id],
	);
	return found;
}

/** The serial numbers of an organization's units, sorted. */
export async function serialsIn(organizationId: string) {
	const found = await rows<{ serial: string }>(
		`select serial_number as serial from equipment where organization_id = ?`,
		[organizationId],
	);
	return found.map((row) => row.serial).sort();
}

/** The ids of an organization's customers, sorted. */
export async function customersIn(organizationId: string) {
	const found = await rows<{ id: number }>(`select id from customer where organization_id = ?`, [
		organizationId,
	]);
	return found.map((row) => String(row.id)).sort();
}

/** The pages of the equipment list and of a unit, as `app`'s page shows them. */
export function equipmentPage(app: App) {
	const bodyRows = () => app.page.locator('[data-slot="data-table"] tbody tr');

	/** The serial numbers on the shown page of the list. */
	const shownSerials = () =>
		bodyRows().evaluateAll((trs) =>
			trs.map((tr) =>
				decodeURIComponent(
					tr.querySelector('a[href^="/equipment/"]')!.getAttribute("href")!.split("/")[2],
				),
			),
		);

	/** The serial numbers on every page of the list, 100 per page, sorted. */
	async function listedSerials() {
		const { page } = app;
		await app.go(afresh("/equipment"));
		await page.getByLabel("Rows per page").click();
		await page.getByRole("option", { name: "100", exact: true }).click();
		await app.tableSettled();
		const found: string[] = [];
		for (;;) {
			found.push(...(await shownSerials()));
			const next = page.getByRole("button", { name: "Go to next page" });
			if (await next.isDisabled()) break;
			await next.click();
			await app.tableSettled();
		}
		return found.sort();
	}

	/** The values the form's customer select offers, sorted. */
	const customerOptions = () =>
		app.page
			.getByLabel("Customer")
			.locator("option")
			.evaluateAll((options: HTMLOptionElement[]) =>
				options
					.map((option) => option.value)
					.filter(Boolean)
					.sort(),
			);

	const timeline = () =>
		app.page.getByRole("list", { name: "Service history" }).locator(":scope > li");

	/** The shown timeline: order numbers, and `installation` and `warranty` for those events. */
	const shownTimeline = () =>
		timeline().evaluateAll((items) =>
			items.map((item) =>
				item.getAttribute("data-event") === "order"
					? item.querySelector('a[href^="/orders/"]')!.textContent!.trim()
					: item.getAttribute("data-event")!,
			),
		);

	/** The text of a summary card, by its title, on one line. */
	const card = async (title: string) =>
		(
			await app.page
				.locator('[data-slot="card"]', { has: app.page.getByText(title, { exact: true }) })
				.first()
				.innerText()
		).replace(/\s+/g, " ");

	return {
		bodyRows,
		shownSerials,
		listedSerials,
		customerOptions,
		timeline,
		shownTimeline,
		card,
	};
}
