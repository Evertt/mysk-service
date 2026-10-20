/**
 * The partner programme in the customer portal: Riedel's contact reads its Partner Bonus page and
 * wallet (also on the portal's home), Pakhuis 7' contact chooses its closed year's bonus once and
 * for good, and a contact whose customer isn't a partner sees neither bonus nor credit. That the
 * portal's remote functions are no office member's is `remote-functions.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, organizations, rows, useApp, users } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";
import { formatCents, formatDate, formatWholeEuros } from "#lib/i18n/index.ts";

import { closedYears, figuresFromDatabase, lastYear, thisYear, walletOf } from "./helpers.ts";

const { shltr } = organizations;
const app = useApp({ user: users.riedel });

const customerNamed = async (name: string) =>
	(
		await rows<{ id: number; code: string }>(
			`select id, code from customer where organization_id = ? and name = ?`,
			[shltr.id, name],
		)
	)[0];

describe("a partner's contact", () => {
	test("reads this year's bonus and the wallet on the home page and the Partner bonus page", async () => {
		const { page } = app;
		const riedel = await customerNamed("Riedel B.V.");
		const figures = await figuresFromDatabase(shltr.id, riedel.id, thisYear);
		// The wallet as seeded: awarded € 3.750 for last year, € 1.475 of it spent in the shop. The
		// shop's tests (on the same worker, maybe before this file) add orders and cancel them.
		const entries = await walletOf(riedel.id);
		expect(entries.slice(0, 3)).toMatchObject([
			{ kind: "award", amount: 375_000, valid_until: `${thisYear}-12-31` },
			{ kind: "spend", amount: -100_000 },
			{ kind: "spend", amount: -47_500 },
		]);
		// All of it valid this year: what's available is what the entries add up to.
		const available = entries.reduce((sum, entry) => sum + entry.amount, 0);
		await app.go("/portal");
		const home = page.locator("[data-client-home-bonus]");
		await home.waitFor();
		expect(await home.locator("[data-partner-revenue]").innerText()).toBe(
			formatWholeEuros(figures.partnerRevenue),
		);
		const wallet = page.locator("[data-client-wallet]");
		expect(await wallet.locator("[data-wallet-awarded]").innerText()).toBe(formatCents(375_000));
		expect(await wallet.locator("[data-wallet-available]").innerText()).toBe(
			formatCents(available),
		);

		await page.getByRole("link", { name: "View the programme and its conditions" }).click();
		await page.waitForURL((url) => url.pathname === "/partner-programme/portal");
		const bonus = page.locator("[data-client-bonus]");
		await bonus.waitFor();
		// The programme's banner, in the organization's name.
		const banner = page.locator("[data-page-banner]");
		expect(await banner.getByRole("heading", { level: 1 }).innerText()).toBe(
			"Growing together. More in return.",
		);
		expect(await banner.innerText()).toContain(`${shltr.name} · Partner programme`.toUpperCase());
		// The wallet's dark panel: its figures are the wallet's.
		const panel = page.getByRole("region", { name: "Wallet" });
		expect(
			await panel
				.locator("dt")
				.evaluateAll((terms) =>
					terms.map((term) => [
						term.textContent!.trim(),
						term.nextElementSibling!.textContent!.trim(),
					]),
				),
		).toEqual([
			["Awarded", formatCents(375_000)],
			["Spent", `– ${formatCents(375_000 - available)}`],
			["Available now", formatCents(available)],
			["Valid until", formatDate(Temporal.PlainDate.from(`${thisYear}-12-31`))],
		]);
		await panel.getByRole("link", { name: "Spend parts credit" }).waitFor();
		expect(await bonus.locator("[data-bonus-revenue]").innerText()).toBe(
			formatWholeEuros(figures.bonusRevenue.cash),
		);
		expect(await bonus.locator("[data-expected-credit]").innerText()).toBe(
			formatCents(figures.bonus.credit),
		);
		expect(await bonus.innerText()).toContain("Not yet available · after the year closes");
		if (figures.level)
			expect(await bonus.locator("[data-level]").innerText()).toBe(figures.level.level);
		// The levels, the revenue that counts, the year's cycle and the conditions, in tabs.
		const programme = page.getByRole("tablist", { name: "The programme" });
		expect(await programme.getByRole("tab").allInnerTexts()).toEqual([
			"Levels",
			"Revenue that counts",
			"The year's cycle",
			"Conditions",
		]);
		expect(await page.locator("[data-client-tiers] [data-tier]").count()).toBe(8);
		expect(await page.locator("[data-client-tiers]").isVisible()).toBe(true);
		expect(await page.locator("[data-client-categories]").isVisible()).toBe(false);
		await programme.getByRole("tab", { name: "Revenue that counts" }).click();
		expect(await page.locator("[data-client-categories] tbody tr").count()).toBe(7);
		await page.locator("[data-client-categories]").waitFor();
		await programme.getByRole("tab", { name: "The year's cycle" }).click();
		await page.locator("[data-client-cycle] li").nth(3).waitFor();
		await programme.getByRole("tab", { name: "Conditions" }).click();
		await page.locator("[data-client-terms]").getByText("Your choice").waitFor();
		// Made for a phone: the tables scroll within their cards.
		expect(await onPhone(page, () => fitsWidth(page))).toBe(true);
		// The wallet's entries, newest first (the latest dozen): the award and the two orders as
		// seeded, and whatever the shop's tests added since.
		expect(
			await page
				.locator("[data-client-wallet] [data-wallet-entry]")
				.evaluateAll((items) => items.map((item) => item.getAttribute("data-wallet-entry"))),
		).toEqual(
			entries
				.toReversed()
				.slice(0, 12)
				.map((entry) => entry.kind),
		);
		// Last year is chosen already: nothing to choose.
		expect(await page.locator("[data-client-choice]").count()).toBe(0);
		await page.locator(`[data-client-closed-year="${lastYear}"] [data-choice="credit"]`).waitFor();
		// From the portal's navigation too, client-side from a page without the home's card.
		await app.go("/portal/orders");
		await page.getByRole("navigation").getByRole("link", { name: "Partner bonus" }).click();
		await page.waitForURL((url) => url.pathname === "/partner-programme/portal");
		await page.locator("[data-client-bonus]").waitFor();
	});

	test("chooses its closed year's bonus once, after a step that says it's for good", async () => {
		const pakhuis = await customerNamed("Pakhuis 7");
		const [closed] = (await closedYears(shltr.id, lastYear)).filter(
			(row) => row.customer_id === pakhuis.id,
		);
		expect(closed.choice).toBeNull();
		const first = await signedInPage(app, users.pakhuis);
		const second = await signedInPage(app, users.pakhuis);
		try {
			for (const { page } of [first, second]) {
				await page.goto(new URL("/partner-programme/portal", page.url()).href);
				await page.locator(`[data-client-choice="${lastYear}"]`).waitFor();
			}
			const { page } = first;
			await page
				.locator('[data-choice-option="credit"]')
				.getByRole("button", { name: "Choose Parts credit" })
				.click();
			const dialog = page.getByRole("alertdialog");
			expect(await dialog.innerText()).toContain("can't be changed or undone");
			await dialog.getByRole("button", { name: "Choose Parts credit" }).click();
			await page.locator("[data-client-choice]").waitFor({ state: "detached" });
			await page.locator('[data-client-wallet] [data-wallet-entry="award"]').waitFor();
			expect(await walletOf(pakhuis.id)).toEqual([
				{
					kind: "award",
					amount: closed.credit_amount,
					valid_until: `${thisYear}-12-31`,
					note: `Parts credit for ${lastYear}`,
				},
			]);

			// The other tab still offers it: the second choice is refused, and nothing changes.
			const other = second.page;
			await other
				.locator('[data-choice-option="cash"]')
				.getByRole("button", { name: "Choose Cash bonus" })
				.click();
			await other
				.getByRole("alertdialog")
				.getByRole("button", { name: "Choose Cash bonus" })
				.click();
			await other
				.getByRole("alertdialog")
				.getByText("The choice for this year has been made already")
				.waitFor();
			const [after] = (await closedYears(shltr.id, lastYear)).filter(
				(row) => row.customer_id === pakhuis.id,
			);
			expect(after.choice).toBe("credit");
			expect(await walletOf(pakhuis.id)).toHaveLength(1);
		} finally {
			await first.page.context().close();
			await second.page.context().close();
		}
	});
});

describe("a partner that chose cash", () => {
	test("reads the credit note that paid it out", async () => {
		const weggemans = await customerNamed("Weggemans Logistiek");
		const [note] = await rows<{ number: string; status: string }>(
			`select n.number, n.status from partner_bonus_credit_note l
			 join partner_bonus_year y on y.id = l.bonus_year_id
			 join credit_note n on n.id = l.credit_note_id
			 where y.customer_id = ? and y.year = ?`,
			[weggemans.id, lastYear],
		);
		expect(note.status).toBe("paid");
		const { page } = await signedInPage(app, users.weggemans);
		try {
			await page.goto(new URL("/partner-programme/portal", page.url()).href);
			const year = page.locator(`[data-client-closed-year="${lastYear}"]`);
			await year.locator('[data-choice="cash"]').waitFor();
			expect(await year.locator(`[data-client-credit-note="${note.number}"]`).innerText()).toBe(
				`Paid out with credit note ${note.number}`,
			);
			// Nothing left to choose, and no credit for the year.
			expect(await page.locator("[data-client-choice]").count()).toBe(0);
		} finally {
			await page.context().close();
		}
	});
});

describe("a contact whose customer isn't a partner", () => {
	test("sees no bonus and no credit", async () => {
		const { page } = await signedInPage(app, users.northCustomer);
		try {
			await page.locator("[data-customer-portal]").waitFor();
			expect(await page.locator("[data-client-home-bonus], [data-client-wallet]").count()).toBe(0);
			await page.getByRole("navigation").getByRole("link", { name: "Partner bonus" }).click();
			await page.locator("[data-client-not-partner]").waitFor();
			expect(await page.locator("[data-client-bonus], [data-client-wallet]").count()).toBe(0);
		} finally {
			await page.context().close();
		}
	});
});
