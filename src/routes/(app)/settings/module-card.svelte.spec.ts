import { beforeEach, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { fakeForm } from "#lib/components/form/fake-form.ts";
import type { ModuleId } from "#lib/modules/ids.ts";

import ModuleCard from "./module-card.svelte";

// The made-up graph: addon requires base, extra requires addon, core-ish is always on. No real
// module has requirements yet, so this is where the card's prompts are tested.
vi.mock("#lib/modules/ids.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/modules/ids.ts")>()),
	moduleGraph: (await import("#lib/modules/fakes.ts")).fakeGraph,
}));

/** What the next form the card makes is like, and what it submitted. */
const form = vi.hoisted(() => ({
	issues: [] as string[],
	submitted: [] as FormData[],
}));
vi.mock("./settings.remote.ts", () => ({
	setModules: {
		for: () =>
			fakeForm<{ enable: string[]; disable: string[] }>(["enable", "disable"], {
				issues: form.issues,
				onsubmit: (data) => form.submitted.push(data),
			}),
	},
}));

beforeEach(() => {
	form.issues = [];
	form.submitted = [];
});

const labels: Record<string, string> = {
	base: "Base",
	addon: "Addon",
	"core-ish": "Core",
	extra: "Extra",
	side: "Side",
};
/** The modules as the settings page has them, with `on` the ones that are on. */
const modulesWith = (on: string[]) =>
	Object.keys(labels).map((id) => ({
		id: id as ModuleId,
		label: labels[id],
		description: `What ${labels[id]} does`,
		enabledAt: on.includes(id) ? new Date(2026, 9, 1) : null,
		alwaysOn: id === "core-ish",
		on: on.includes(id) || id === "core-ish",
	}));
const card = (id: string, on: string[]) => {
	const modules = modulesWith(on);
	return { module: modules.find((module) => module.id === id)!, modules, canManage: true };
};

test("switching a module on names what it also switches on, and submits them together", async () => {
	render(ModuleCard, card("addon", []));

	await expect.element(page.getByText("Also switches on Base.")).toBeVisible();
	await page.getByRole("button", { name: "Enable" }).click();

	expect(form.submitted).toHaveLength(1);
	expect(form.submitted[0].getAll("enable[]")).toEqual(["addon", "base"]);
});

test("switching off a module others need asks first, then switches them off together", async () => {
	render(ModuleCard, card("base", ["base", "addon"]));

	await page.getByRole("button", { name: "Disable" }).click();
	const dialog = page.getByRole("alertdialog");
	await expect.element(dialog.getByText("Also switches off Addon, which need it.")).toBeVisible();
	expect(form.submitted).toHaveLength(0);
	await dialog.getByRole("button", { name: "Disable" }).click();

	expect(form.submitted).toHaveLength(1);
	expect(form.submitted[0].getAll("disable[]")).toEqual(["base", "addon"]);
});

test("a refusal shows inside the dialog", async () => {
	form.issues = ["This would leave Addon without what they need."];
	render(ModuleCard, card("base", ["base", "addon"]));

	await page.getByRole("button", { name: "Disable" }).click();

	await expect
		.element(page.getByRole("alertdialog").getByRole("alert"))
		.toHaveTextContent("This would leave Addon without what they need.");
});

test("a refusal of a plain switch shows on the card", async () => {
	form.issues = ["Choose a module to switch on or off."];
	render(ModuleCard, card("side", []));

	await expect
		.element(page.getByRole("alert"))
		.toHaveTextContent("Choose a module to switch on or off.");
});

test("an always-on module has no switch", async () => {
	render(ModuleCard, card("core-ish", []));

	await expect.element(page.getByRole("button", { name: "Always on" })).toBeDisabled();
	expect(document.querySelector("form")).toBeNull();
});
