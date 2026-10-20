import { beforeEach, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import type { ModuleId } from "#lib/modules/ids.ts";
import ModuleCard from "#routes/(app)/settings/module-card.svelte";
import { resetHistoryDialogs } from "#unit/lib/components/fake-history-dialog.svelte.ts";
import { fakeForm } from "#unit/lib/components/form/fake-form.ts";
import { at } from "#unit/temporal-support.ts";

// The made-up graph: addon requires base, extra requires addon, core-ish is always on. No real
// module has requirements yet, so this is where the card's prompts are tested.
vi.mock("#lib/modules/ids.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/modules/ids.ts")>()),
	moduleGraph: (await import("#unit/lib/modules/fakes.ts")).fakeGraph,
}));

// The dialog opens with a history entry of its own, through SvelteKit's router, which a component
// test hasn't got.
vi.mock(
	"#lib/components/history-dialog.svelte.ts",
	() => import("#unit/lib/components/fake-history-dialog.svelte.ts"),
);

// A manager's card: the switches show.
vi.mock("#lib/auth/can-manage.ts", () => ({ canManage: async () => true }));

/** What the next form the card makes is like, and what it submitted. */
const form = vi.hoisted(() => ({
	issues: [] as string[],
	submitted: [] as FormData[],
}));
vi.mock("#routes/(app)/settings/settings.remote.ts", () => ({
	setModules: {
		for: () =>
			fakeForm<{ enable: string[]; disable: string[] }>(["enable", "disable"], {
				issues: form.issues,
				onsubmit: (data) => form.submitted.push(data),
			}),
	},
}));

beforeEach(() => {
	resetHistoryDialogs();
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
		enabledAt: on.includes(id) ? at("2026-10-01 00:00") : null,
		alwaysOn: id === "core-ish",
		on: on.includes(id) || id === "core-ish",
	}));
const card = (id: string, on: string[]) => {
	const modules = modulesWith(on);
	return { module: modules.find((module) => module.id === id)!, modules };
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

test("a module that's set up on a page of its own links to it while it's on", async () => {
	const off = render(ModuleCard, { ...card("side", []), settingsHref: "/side/setup" });
	expect(document.querySelector('a[href="/side/setup"]')).toBeNull();
	await off.unmount();

	render(ModuleCard, { ...card("side", ["side"]), settingsHref: "/side/setup" });
	await expect
		.element(page.getByRole("link", { name: "Set up" }))
		.toHaveAttribute("href", "/side/setup");
});

test("an always-on module has no switch", async () => {
	render(ModuleCard, card("core-ish", []));

	await expect.element(page.getByRole("button", { name: "Always on" })).toBeDisabled();
	expect(document.querySelector("form")).toBeNull();
});
