import { error } from "@sveltejs/kit";
import { beforeEach, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import { resetHistoryDialogs } from "#unit/lib/components/fake-history-dialog.svelte.ts";

import Harness from "./confirm-dialog.test-harness.svelte";
import { fakeIdForm } from "./fake-form.ts";

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
	toast.error.mockReset();
});

const props = {
	title: "Retire this template?",
	description: "New checklists can't use it.",
	confirmLabel: "Retire",
	done: "Retired.",
};

async function confirm() {
	await page.getByRole("button", { name: "Open from outside" }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Retire" }).click();
}

test("asks the question, with what the opener adds", async () => {
	render(Harness, { form: fakeIdForm(), ...props });

	await page.getByRole("button", { name: "Open from outside" }).click();

	const dialog = page.getByRole("alertdialog");
	await expect.element(dialog.getByText("Retire this template?")).toBeVisible();
	await expect.element(dialog.getByText("New checklists can't use it.")).toBeVisible();
	await expect.element(dialog.getByText("The orders stay.")).toBeVisible();
});

test("confirming submits the hidden inputs, then closes and says it's done", async () => {
	const onsubmit = vi.fn();
	render(Harness, { form: fakeIdForm({ onsubmit }), hidden: { id: "42" }, ...props });

	await confirm();

	expect(Object.fromEntries(onsubmit.mock.calls[0][0])).toEqual({ id: "42" });
	await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
	await expect.element(page.getByTestId("open")).toHaveTextContent("closed");
	expect(toast.success).toHaveBeenCalledWith("Retired.");
});

test("shows why the server refused, and stays open", async () => {
	render(Harness, { form: fakeIdForm({ issues: ["It's still in use."] }), ...props });

	await confirm();

	await expect
		.element(page.getByRole("alertdialog").getByRole("alert"))
		.toHaveTextContent("It's still in use.");
	expect(toast.success).not.toHaveBeenCalled();
});

test("without a form, confirming runs `onconfirm`", async () => {
	const onconfirm = vi.fn(async () => {});
	const ondone = vi.fn();
	render(Harness, { onconfirm, ondone, ...props });

	await confirm();

	expect(onconfirm).toHaveBeenCalledOnce();
	await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
	expect(ondone).toHaveBeenCalledOnce();
	expect(toast.success).toHaveBeenCalledWith("Retired.");
});

test("what `onconfirm` answers is the result `ondone`, `done` and `leave` read", async () => {
	const result = { href: "/invoices/7" };
	const ondone = vi.fn();
	const leave = vi.fn((answer?: unknown) => (answer as typeof result).href);
	render(Harness, {
		...props,
		onconfirm: async () => result,
		ondone,
		done: (answer) => `Opened ${(answer as typeof result).href}.`,
		leave,
	});

	await confirm();

	await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
	expect(ondone).toHaveBeenCalledWith(result);
	expect(toast.success).toHaveBeenCalledWith("Opened /invoices/7.");
	expect(leave).toHaveBeenCalledWith(result);
});

test("when `onconfirm` fails, a toast says why and it stays open", async () => {
	render(Harness, {
		onconfirm: async () => error(404, "The view was deleted elsewhere."),
		...props,
	});

	await confirm();

	await expect.poll(() => toast.error.mock.calls).toEqual([["The view was deleted elsewhere."]]);
	await expect.element(page.getByRole("alertdialog")).toBeVisible();
	expect(toast.success).not.toHaveBeenCalled();
});

test("`onconfirm` answering false keeps it open", async () => {
	render(Harness, { onconfirm: async () => false, ...props });

	await confirm();

	await expect.element(page.getByRole("alertdialog")).toBeVisible();
	expect(toast.success).not.toHaveBeenCalled();
});

test("the confirm button is disabled while it runs", async () => {
	render(Harness, { onconfirm: () => new Promise(() => {}), ...props });

	await confirm();

	const button = page.getByRole("alertdialog").getByRole("button", { name: "Loading Retire" });
	await expect.element(button).toBeDisabled();
});

test("going back (its history entry going) closes it", async () => {
	render(Harness, { form: fakeIdForm(), ...props });

	await page.getByRole("button", { name: "Open from outside" }).click();
	await expect.element(page.getByRole("alertdialog")).toBeVisible();
	resetHistoryDialogs();

	await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
	await expect.element(page.getByTestId("open")).toHaveTextContent("closed");
});
