/**
 * The wiki's short texts are Paraglide's (docs/plans/wiki-dutch.md): under Dutch, the parts and
 * every kind of widget read Dutch, with the app's own words where it has them (order statuses, the
 * demo roles, module names). The other specs here assert the English.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { getLocale, type Locale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import DemoSwitchedOff from "#wiki/parts/demo-switched-off.svelte";
import DocsPointer from "#wiki/parts/docs-pointer.svelte";
import HowItWorks from "#wiki/parts/how-it-works.svelte";
import PageStatus from "#wiki/parts/page-status.svelte";
import Search from "#wiki/search.svelte";
import GateTable from "#wiki/widgets/gate-table/gate-table.svelte";
import ListPlayground from "#wiki/widgets/list-playground/list-playground.svelte";
import LiveFlow from "#wiki/widgets/live-flow/live-flow.svelte";
import ModuleMap from "#wiki/widgets/module-map/module-map.svelte";
import OrderLifecycle from "#wiki/widgets/order-lifecycle/order-lifecycle.svelte";
import RecordsDiagram from "#wiki/widgets/records/records-diagram.svelte";
import RoleSwitcher from "#wiki/widgets/role-switcher/role-switcher.svelte";
import TenancySimulator from "#wiki/widgets/tenancy-simulator/tenancy-simulator.svelte";
import ThemeGallery from "#wiki/widgets/theme-gallery/theme-gallery.svelte";

// The demo's remote functions, which the role switcher's buttons and the demo note ask: the demo's
// sign-in is on and the visitor isn't in it.
vi.mock("#routes/demo.remote.ts", () => {
	const form = (id: string) =>
		Object.defineProperties(
			{ method: "POST", action: `?/remote=demoSignIn/${id}` },
			{
				pending: { value: 0 },
				fields: {
					value: {
						role: { as: (type: string, value: string) => ({ type, name: "role", value }) },
					},
				},
			},
		);
	return {
		demoSignInEnabled: vi.fn(() => Promise.resolve(false)),
		getViewAs: vi.fn(() => Promise.resolve(null)),
		demoSignIn: { for: vi.fn(form) },
	};
});

const englishByDefault = getLocale;
const inLanguage = (locale: Locale) => overwriteGetLocale(() => locale);

beforeEach(() => inLanguage("nl"));
afterEach(() => overwriteGetLocale(englishByDefault));

const state = (id: string) =>
	document.querySelector(`[data-module="${id}"]`)?.getAttribute("data-state");

describe("the parts, in Dutch", () => {
	test("the how-it-works divider", async () => {
		await render(HowItWorks);
		await expect.element(page.getByRole("heading", { name: "Hoe het werkt" })).toBeVisible();
	});

	test("the status notices", async () => {
		await render(PageStatus, { status: "planned" });
		await expect.element(page.getByText(/Dit staat gepland/)).toBeVisible();
		await render(PageStatus, { status: "partly built" });
		await expect.element(page.getByText(/Dit is deels gebouwd/)).toBeVisible();
	});

	test("the docs pointer", async () => {
		await render(DocsPointer, { doc: "docs/agents/tenancy.md" });
		await expect.element(page.getByText(/De regels:/)).toBeVisible();
	});

	test("the note that the demo's sign-in is off", async () => {
		await render(DemoSwitchedOff);
		await expect
			.element(page.getByText("Inloggen met één klik in de demo staat uit op deze server."))
			.toBeVisible();
	});

	test("the search trigger", async () => {
		await render(Search);
		await expect.element(page.getByRole("button", { name: "Zoek in de wiki" })).toBeVisible();
		await expect.element(page.getByText("Zoek in de wiki…")).toBeInTheDocument();
	});
});

describe("the widgets, in Dutch", () => {
	test("the live flow: its steps, its drawing and its buttons", async () => {
		await render(LiveFlow);
		await expect.element(page.getByText("Stap 1 van 4")).toBeVisible();
		await expect.element(page.getByText("Een record verandert")).toBeVisible();
		await expect
			.element(page.getByRole("img", { name: /Een wijziging gaat van de server/ }))
			.toBeVisible();
		await expect.element(page.getByRole("button", { name: "Terug" })).toBeDisabled();
		await page.getByRole("button", { name: "Volgende" }).click();
		await expect.element(page.getByText("recordActivity() logt het")).toBeVisible();
		// The step's detail names the call whole: no braces of a literal read as an input.
		await expect.element(page.getByText(/recordActivity\(tx, entry\)/)).toBeVisible();
		expect(document.body.textContent).not.toContain("undefined");
		await expect.element(page.getByRole("button", { name: "Afspelen" })).toBeVisible();
	});

	test("the order lifecycle: the app's status names, and who makes a move", async () => {
		await render(OrderLifecycle);
		// The app's word for a quote is "Nieuw".
		await page.getByRole("button", { name: "Nieuw", exact: true }).click();

		await expect
			.element(page.getByTestId("leaves-plan-scheduled"))
			.toHaveTextContent("plan naar Ingepland, door een planner");
		await expect.element(page.getByRole("list", { name: "Uitgaande stappen" })).toBeVisible();
		await expect.element(page.getByRole("list", { name: "Wie een stap zet" })).toBeVisible();
	});

	test("the module map: its switches, key and states", async () => {
		await render(ModuleMap);
		await expect.element(page.getByText("modules aan")).toBeVisible();
		await expect.element(page.getByRole("list", { name: "Legenda" })).toBeVisible();
		await expect.element(page.getByRole("button", { name: "Alles aanzetten" })).toBeDisabled();

		await page
			.getByRole("switch", {
				name: document.querySelector('[data-module="invoices"] label')?.textContent ?? "",
			})
			.click();
		await expect.poll(() => state("parts-shop")).toBe("dropped");
		await expect.element(page.getByText(/^Uit: heeft .* nodig$/).first()).toBeVisible();
	});

	test("the tenancy simulator: its fields, options and refusals", async () => {
		await render(TenancySimulator);
		await expect.element(page.getByText("Ingelogd bij")).toBeVisible();
		await expect.element(page.getByLabelText("De query")).toBeVisible();
		await page.getByLabelText("Leest:").selectOptions("de opdracht met id 2 (van South)");

		await expect.element(page.getByText("404 Niet gevonden")).toBeVisible();
		await page.getByRole("switch", { name: "Begrensd met inTenant()" }).click();
		await expect.element(page.getByText("Een lek")).toBeVisible();
		await expect.element(page.getByText(/leest 1 opdracht van een andere tenant/)).toBeVisible();
	});

	test("the gate table: who is calling, and what each gate does", async () => {
		await render(GateTable);
		await expect.element(page.getByText("Wie roept aan").first()).toBeVisible();
		await expect.element(page.getByText("Planner (een lid)")).toBeVisible();
		// The callers the app names itself: its role labels, and its "not signed in".
		await expect.element(page.getByText("Klantcontact")).toBeVisible();
		await expect.element(page.getByText("Niet ingelogd")).toBeVisible();
		await expect.element(page.getByText("Doorgelaten").first()).toBeVisible();
		await expect.element(page.getByText(/Geweigerd, 403/).first()).toBeVisible();
		await expect.element(page.getByText(/^Het monteursportaal\./)).toBeVisible();
	});

	test("the list playground: its labels, the app's statuses and the sites", async () => {
		await render(ListPlayground);
		await expect.element(page.getByText("Alle statussen")).toBeInTheDocument();
		await expect.element(page.getByText("Groeperen op status")).toBeVisible();
		await expect.element(page.getByText(/van 25 opdrachten/)).toBeVisible();
		// The statuses are the app's own Dutch labels.
		await expect.element(page.getByText("Ingepland").first()).toBeInTheDocument();
		await expect.element(page.getByText("Nieuw (te accepteren)").first()).toBeInTheDocument();
		await expect.element(page.getByText("Opdracht", { exact: true }).first()).toBeVisible();

		await page.getByRole("textbox").first().fill("zzzzzz");
		await expect.element(page.getByText("Geen opdrachten gevonden")).toBeVisible();
	});

	test("the list playground searches the sites in Dutch", async () => {
		await render(ListPlayground);
		await page.getByRole("textbox").first().fill("kade");
		await expect.element(page.getByText("Kade 4").first()).toBeInTheDocument();
		expect(document.body.textContent).not.toContain("Quay 4");
	});

	test("the role switcher: the demo roles' labels, shells and what each can do", async () => {
		await render(RoleSwitcher);
		await expect.element(page.getByRole("heading", { name: "Monteur" })).toBeVisible();
		await expect.element(page.getByRole("heading", { name: "Klant" })).toBeVisible();
		await expect.element(page.getByText(/^Het monteursportaal begint op/)).toBeVisible();
		await expect.element(page.getByText(/De gegevens van andere klanten zien\./)).toBeVisible();
		// The module is named as the app names it.
		await expect.element(page.getByText(/als de module Werkbonnen aan staat/)).toBeVisible();
	});

	test("the theme gallery: the default badge and the sample's texts", async () => {
		await render(ThemeGallery);
		await expect.element(page.getByText("Standaard").first()).toBeVisible();
		await expect.element(page.getByText("Opdracht ORD-2026-00014").first()).toBeVisible();
		await expect.element(page.getByText("Afdrukken").first()).toBeVisible();
		// The badges are the app's own labels: a quote is "Nieuw", and urgent is "Spoed".
		await expect.element(page.getByText("Nieuw").first()).toBeVisible();
		await expect.element(page.getByText("Spoed").first()).toBeVisible();
	});

	test("the records diagram: the app's names and Dutch arrows", async () => {
		await render(RecordsDiagram);
		await expect
			.element(page.getByRole("img", { name: /^Records: een klant heeft vestigingen/ }))
			.toBeVisible();
		const text = document.querySelector("svg")?.textContent ?? "";
		for (const word of ["Klant", "Vestiging", "Opdracht", "Apparaat", "Locatie", "Monteur"]) {
			expect(text, word).toContain(word);
		}
		expect(text).toContain("toegewezen");
	});
});
