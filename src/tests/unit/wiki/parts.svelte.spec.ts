import { createRawSnippet, tick } from "svelte";
import { beforeEach, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { demoSignInEnabled } from "#routes/demo.remote.ts";
import Diagram from "#wiki/parts/diagram.svelte";
import DocsPointer from "#wiki/parts/docs-pointer.svelte";
import HowItWorks from "#wiki/parts/how-it-works.svelte";
import PageStatus from "#wiki/parts/page-status.svelte";
import SourceLink from "#wiki/parts/source-link.svelte";
import TryIt from "#wiki/parts/try-it.svelte";

import TryItInPage from "./try-it.test-harness.svelte";

// The one remote function the wiki calls: whether the SHLTR demo's sign-in is switched on.
const demo = vi.hoisted(() => ({ enabled: false, fails: false }));
vi.mock("#routes/demo.remote.ts", () => ({
	demoSignInEnabled: vi.fn(() =>
		demo.fails ? Promise.reject(new Error("offline")) : Promise.resolve(demo.enabled),
	),
}));

const englishByDefault = getLocale;
const text = (html: string) => createRawSnippet(() => ({ render: () => `<span>${html}</span>` }));
const github = "https://github.com/Evertt/mysk-service/blob";

beforeEach(() => {
	demo.enabled = false;
	demo.fails = false;
	vi.mocked(demoSignInEnabled).mockClear();
});

/** Waits until try it has asked, and its answer has had its turn in the page. */
async function answered() {
	await vi.waitFor(() => expect(demoSignInEnabled).toHaveBeenCalledTimes(1));
	await Promise.allSettled([vi.mocked(demoSignInEnabled).mock.results[0].value]);
	await tick();
	await new Promise((resolve) => setTimeout(resolve, 50));
}

test("the test build knows the commit the source links point at", () => {
	expect(__WIKI_COMMIT__).toBeTruthy();
});

test("a source link points at the file at this commit, on the line, in a new tab", async () => {
	await render(SourceLink, {
		path: "src/lib/orders/lifecycle.ts",
		line: 69,
		children: text("the transition table"),
	});

	const link = page.getByRole("link", { name: "the transition table" });
	await expect
		.element(link)
		.toHaveAttribute("href", `${github}/${__WIKI_COMMIT__}/src/lib/orders/lifecycle.ts#L69`);
	await expect.element(link).toHaveAttribute("target", "_blank");
	await expect.element(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
});

test("a source link without a line has no anchor, and is labelled with the file's name", async () => {
	await render(SourceLink, { path: "src/lib/orders/lifecycle.ts" });

	const link = page.getByRole("link", { name: "lifecycle.ts" });
	await expect
		.element(link)
		.toHaveAttribute("href", `${github}/${__WIKI_COMMIT__}/src/lib/orders/lifecycle.ts`);
});

test("a docs pointer links to the doc on GitHub, to the section's anchor", async () => {
	await render(DocsPointer, { doc: "docs/agents/tenancy.md", section: "Tenancy rules" });

	const link = page.getByRole("link", { name: /tenancy\.md/ });
	await expect
		.element(link)
		.toHaveAttribute("href", `${github}/${__WIKI_COMMIT__}/docs/agents/tenancy.md#tenancy-rules`);
	await expect.element(page.getByText(/The rules/)).toBeVisible();
});

test("a docs pointer without a section links to the doc itself", async () => {
	await render(DocsPointer, { doc: "docs/agents/tenancy.md" });

	await expect
		.element(page.getByRole("link", { name: /tenancy\.md/ }))
		.toHaveAttribute("href", `${github}/${__WIKI_COMMIT__}/docs/agents/tenancy.md`);
});

test("try it, where the demo's sign-in is on: a link to the login page, with the role's label", async () => {
	demo.enabled = true;
	await render(TryIt, { as: "planner" });

	const link = page.getByRole("link", { name: "Try it as the planner" });
	await expect.element(link).toBeVisible();
	await expect.element(link).toHaveAttribute("href", "/login");
});

test("try it names the role in English, also where the app speaks Dutch", async () => {
	demo.enabled = true;
	overwriteGetLocale(() => "nl");
	try {
		await render(TryIt, { as: "engineer" });
		await expect
			.element(page.getByRole("link", { name: "Try it as the field engineer" }))
			.toBeVisible();
		await render(TryIt, { as: "customer" });
		await expect
			.element(page.getByRole("link", { name: "Try it as the customer contact" }))
			.toBeVisible();
	} finally {
		overwriteGetLocale(englishByDefault);
	}
});

test("try it, where the demo's sign-in is off: nothing, once the answer is in", async () => {
	const { container } = await render(TryIt, { as: "planner" });

	await answered();
	expect(container.textContent).toBe("");
	expect(page.getByRole("link").elements()).toHaveLength(0);
});

test("try it, where the demo's answer fails: nothing, and the rest of the page renders", async () => {
	demo.fails = true;
	const errors = vi.spyOn(console, "error").mockImplementation(() => {});
	await render(TryItInPage);

	await answered();
	await expect.element(page.getByText("Before the link")).toBeVisible();
	await expect.element(page.getByText("After the link")).toBeVisible();
	expect(page.getByRole("link").elements()).toHaveLength(0);
	errors.mockRestore();
});

test("the how-it-works divider: the heading, before the developer half", async () => {
	await render(HowItWorks);

	await expect.element(page.getByRole("heading", { name: "How it works" })).toBeVisible();
});

test("a built page has no status notice", async () => {
	const { container } = await render(PageStatus, { status: "built" });

	expect(container.querySelector("[data-callout]")).toBeNull();
	expect(container.textContent).toBe("");
});

test("a page that is planned says so", async () => {
	const { container } = await render(PageStatus, { status: "planned" });

	await expect.element(page.getByText(/planned/i)).toBeVisible();
	expect(container.querySelector("[data-callout]")).not.toBeNull();
});

test("a page that is partly built says so", async () => {
	const { container } = await render(PageStatus, { status: "partly built" });

	await expect.element(page.getByText(/partly built/i)).toBeVisible();
	expect(container.querySelector("[data-callout]")).not.toBeNull();
});

test("a diagram is an image of its label, as wide as its container, with its children inside", async () => {
	const { container } = await render(Diagram, {
		viewBox: "0 0 200 100",
		label: "Order lifecycle",
		children: createRawSnippet(() => ({ render: () => '<rect width="10" height="10" />' })),
	});

	const svg = page.getByRole("img", { name: "Order lifecycle" });
	await expect.element(svg).toBeVisible();
	await expect.element(svg).toHaveAttribute("viewBox", "0 0 200 100");
	await expect.element(svg).toHaveAttribute("width", "100%");
	expect(container.querySelector("svg rect")).not.toBeNull();
});
