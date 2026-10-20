import { beforeEach, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { resetHistoryDialogs } from "#unit/lib/components/fake-history-dialog.svelte.ts";

import { fakeForm } from "./fake-form.ts";
import Harness from "./form-dialog.test-harness.svelte";

// The dialog opens with a history entry of its own, through SvelteKit's router, which a component
// test hasn't got.
vi.mock(
	"#lib/components/history-dialog.svelte.ts",
	() => import("#unit/lib/components/fake-history-dialog.svelte.ts"),
);

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast }));

beforeEach(() => {
	resetHistoryDialogs();
	toast.success.mockReset();
});

type Input = { id: string; name: string };
const form = (options: Parameters<typeof fakeForm>[1] = {}) =>
	fakeForm<Input>(["id", "name"], options) as never;

const props = { title: "New location", description: "Where the units are." };

test("its trigger opens it with the title, the fields and Save", async () => {
	render(Harness, { form: form(), ...props });

	expect(page.getByRole("dialog").elements()).toHaveLength(0);
	await page.getByRole("button", { name: "New location" }).click();

	const dialog = page.getByRole("dialog");
	await expect.element(dialog.getByRole("heading", { name: "New location" })).toBeVisible();
	await expect.element(dialog.getByText("Where the units are.")).toBeVisible();
	await expect.element(dialog.getByRole("textbox", { name: "Name" })).toBeVisible();
	await expect.element(dialog.getByRole("button", { name: "Save" })).toBeVisible();
	await expect.element(page.getByTestId("open")).toHaveTextContent("open");
});

test("submitting sends the fields and the hidden inputs, then closes and says it's done", async () => {
	const onsubmit = vi.fn();
	render(Harness, { form: form({ onsubmit }), ...props, hidden: { id: "7" }, done: "Saved." });

	await page.getByRole("button", { name: "New location" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Boiler room");
	await page.getByRole("button", { name: "Save" }).click();

	expect(Object.fromEntries(onsubmit.mock.calls[0][0])).toEqual({ id: "7", name: "Boiler room" });
	await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
	await expect.element(page.getByTestId("open")).toHaveTextContent("closed");
	expect(toast.success).toHaveBeenCalledWith("Saved.");
});

test("the toast and `ondone` read the server's answer", async () => {
	const ondone = vi.fn();
	render(Harness, {
		form: form({ result: { code: "Z-A" } }),
		...props,
		done: (result) => `Saved ${result?.code}.`,
		ondone,
	});

	await page.getByRole("button", { name: "New location" }).click();
	await page.getByRole("button", { name: "Save" }).click();

	await expect.poll(() => toast.success.mock.calls).toEqual([["Saved Z-A."]]);
	expect(ondone).toHaveBeenCalledWith({ code: "Z-A" });
});

test("`reset` empties the fields for the next one", async () => {
	render(Harness, { form: form(), ...props, reset: true });

	await page.getByRole("button", { name: "New location" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Boiler room");
	await page.getByRole("button", { name: "Save" }).click();
	await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

	await page.getByRole("button", { name: "New location" }).click();
	await expect.element(page.getByRole("textbox", { name: "Name" })).toHaveValue("");
});

test("`updates` names the queries the submission refreshes", async () => {
	const onupdates = vi.fn();
	const query = { name: "getLocations" };
	render(Harness, { form: form({ onupdates }), ...props, updates: () => [query as never] });

	await page.getByRole("button", { name: "New location" }).click();
	await page.getByRole("button", { name: "Save" }).click();

	await expect.poll(() => onupdates.mock.calls).toEqual([[query]]);
});

test("a refusal shows in the dialog, which stays open", async () => {
	render(Harness, {
		form: form({ issues: ["The site was deleted in the meantime."] }),
		...props,
		done: "Saved.",
	});

	await page.getByRole("button", { name: "New location" }).click();
	await page.getByRole("button", { name: "Save" }).click();

	await expect
		.element(page.getByRole("dialog").getByRole("alert"))
		.toHaveTextContent("The site was deleted in the meantime.");
	expect(toast.success).not.toHaveBeenCalled();
});

test("opens from outside, and Cancel closes it for the parent too", async () => {
	render(Harness, { form: form(), ...props, withTrigger: false });

	await page.getByRole("button", { name: "Open from outside" }).click();
	await expect.element(page.getByRole("dialog")).toBeVisible();

	await page.getByRole("button", { name: "Cancel" }).click();
	await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
	await expect.element(page.getByTestId("open")).toHaveTextContent("closed");
});

test("going back (its history entry going) closes it", async () => {
	render(Harness, { form: form(), ...props });

	await page.getByRole("button", { name: "New location" }).click();
	await expect.element(page.getByRole("dialog")).toBeVisible();
	resetHistoryDialogs();

	await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
	await expect.element(page.getByTestId("open")).toHaveTextContent("closed");
});

test("the submit button is disabled while submitting", async () => {
	render(Harness, { form: form({ pending: 1 }), ...props, submitLabel: "Add" });

	await page.getByRole("button", { name: "New location" }).click();

	await expect.element(page.getByRole("button", { name: "Loading Add" })).toBeDisabled();
});
