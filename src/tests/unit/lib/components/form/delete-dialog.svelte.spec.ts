import { expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import DeleteDialog from "#lib/components/form/delete-dialog.svelte";

import { fakeIdForm } from "./fake-form.ts";

const props = {
	id: "42",
	title: "Delete this customer?",
	description: "Their orders and equipment stay.",
};

test("asks for confirmation before deleting", async () => {
	render(DeleteDialog, { form: fakeIdForm(), ...props });

	expect(page.getByRole("alertdialog").elements()).toHaveLength(0);
	await page.getByRole("button", { name: "Delete" }).click();

	const dialog = page.getByRole("alertdialog");
	await expect.element(dialog.getByText("Delete this customer?")).toBeVisible();
	await expect.element(dialog.getByText("Their orders and equipment stay.")).toBeVisible();
});

test("confirming submits the record's id", async () => {
	const onsubmit = vi.fn();
	render(DeleteDialog, { form: fakeIdForm({ onsubmit }), ...props });

	await page.getByRole("button", { name: "Delete" }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

	expect(onsubmit).toHaveBeenCalledOnce();
	expect(Object.fromEntries(onsubmit.mock.calls[0][0])).toEqual({ id: "42" });
});

test("deleting leaves the page's queries alone, as the form refreshes what it changes", async () => {
	const onupdates = vi.fn();
	const onsubmit = vi.fn();
	render(DeleteDialog, { form: fakeIdForm({ onsubmit, onupdates }), ...props });

	await page.getByRole("button", { name: "Delete" }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

	expect(onsubmit).toHaveBeenCalledOnce();
	// `updates()` with nothing: none of the page's queries, instead of all of them.
	expect(onupdates.mock.calls).toEqual([[]]);
});

test("cancelling closes the dialog without submitting", async () => {
	const onsubmit = vi.fn();
	render(DeleteDialog, { form: fakeIdForm({ onsubmit }), ...props });

	await page.getByRole("button", { name: "Delete" }).click();
	await page.getByRole("button", { name: "Cancel" }).click();

	await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
	expect(onsubmit).not.toHaveBeenCalled();
});

test("shows why the server refused", async () => {
	render(DeleteDialog, {
		form: fakeIdForm({ issues: ["This customer still has open orders."] }),
		...props,
	});

	await page.getByRole("button", { name: "Delete" }).click();

	await expect
		.element(page.getByRole("alertdialog").getByRole("alert"))
		.toHaveTextContent("This customer still has open orders.");
});

test("the confirm button is disabled while deleting", async () => {
	render(DeleteDialog, { form: fakeIdForm({ pending: 1 }), ...props, label: "Remove" });

	await page.getByRole("button", { name: "Remove" }).click();

	const confirm = page.getByRole("alertdialog").getByRole("button", { name: "Loading Remove" });
	await expect.element(confirm).toBeDisabled();
	await expect.element(confirm.getByRole("status")).toBeInTheDocument();
});
