/**
 * A year's rules form's levels as they're typed: a number keeps what's typed (a cleared threshold
 * stays empty, for the form's validation to refuse on save, not 0; a decimal point typed on the way
 * to "3.5" stays), and a new level follows the last one's threshold, or starts at € 50,000 when
 * that one is empty.
 */
import { expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import RulesForm from "#modules/partner-programme/form/rules-form.svelte";
import { defaultCategoryRules, type ProgrammeRules } from "#modules/partner-programme/model.ts";

// The form's fields, nested as a remote form's (`fields.tiers[0].threshold`), each a fake field.
vi.mock("#modules/partner-programme/years.remote.ts", async () => {
	const { fakeField } = await import("#unit/lib/components/form/fake-form.ts");
	const fieldsAt = (path: string): unknown =>
		new Proxy(fakeField(path), {
			get(field, key, receiver) {
				if (typeof key === "symbol" || key in field) return Reflect.get(field, key, receiver);
				return fieldsAt(/^\d+$/.test(key) ? `${path}[${key}]` : path ? `${path}.${key}` : key);
			},
		});
	const saveYearRules = {
		fields: fieldsAt(""),
		pending: 0,
		enhance: () => ({ method: "POST", onsubmit: (event: SubmitEvent) => event.preventDefault() }),
	};
	return { saveYearRules };
});

const rules: ProgrammeRules = {
	year: 2026,
	tiers: [
		{ threshold: 5_000_000, level: "BRONZE", cashRate: 250, creditRate: 300 },
		{ threshold: 7_500_000, level: "SILVER", cashRate: 270, creditRate: 330 },
	],
	categories: defaultCategoryRules,
	creditValidYears: 1,
};

const thresholds = () => page.getByRole("spinbutton", { name: "Partner revenue from" });

test("a cleared threshold stays empty, and a new level then starts at € 50,000", async () => {
	render(RulesForm, { year: 2026, rules });
	const last = thresholds().nth(1);
	await expect.element(last).toHaveValue(75_000);
	await last.fill("");
	await expect.element(last).toHaveValue(null);
	await page.getByRole("button", { name: "Add level" }).click();
	await expect.element(thresholds().nth(2)).toHaveValue(50_000);
	await expect.element(last).toHaveValue(null);
});

test("a rate keeps its decimal point while it's typed", async () => {
	render(RulesForm, { year: 2026, rules });
	const cash = page.getByRole("spinbutton", { name: "Cash bonus" }).first();
	await expect.element(cash).toHaveValue(2.5);
	await cash.fill("");
	await userEvent.type(cash, "3.8");
	await expect.element(cash).toHaveValue(3.8);
});
