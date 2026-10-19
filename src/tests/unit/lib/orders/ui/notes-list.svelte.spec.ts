import { createRawSnippet } from "svelte";
import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-svelte";

import NotesList from "#lib/orders/ui/notes-list.svelte";

const notes = [
	{
		id: 1,
		text: "Replaced the gasket",
		createdAt: Temporal.Instant.from("2026-10-14T09:00:00Z"),
		author: "Erik Jansen",
	},
	{
		id: 2,
		text: "Bring a new cable set",
		createdAt: Temporal.Instant.from("2026-10-14T10:00:00Z"),
		author: null,
	},
];

const footer = createRawSnippet(() => ({ render: () => "<button>Add note</button>" }));

test("lists the notes in their order, each with who wrote it, or someone, and when", async () => {
	render(NotesList, { notes, empty: "No notes yet.", footer });

	await expect.element(page.getByText("Replaced the gasket")).toBeVisible();
	const texts = page.getByText(/^(Replaced the gasket|Bring a new cable set)$/).elements();
	expect(texts.map((each) => each.textContent)).toEqual([
		"Replaced the gasket",
		"Bring a new cable set",
	]);
	await expect.element(page.getByText(/^Erik Jansen · .*2026/)).toBeVisible();
	await expect.element(page.getByText(/^Someone · .*2026/)).toBeVisible();
	expect(page.getByText("No notes yet.").elements()).toHaveLength(0);
	await expect.element(page.getByRole("button", { name: "Add note" })).toBeVisible();
});

test("says `empty` while there are none, and nothing without it", async () => {
	const { container, rerender } = render(NotesList, { notes: [], empty: "No notes yet." });
	await expect.element(page.getByText("No notes yet.")).toBeVisible();

	await rerender({ notes: [], empty: undefined });
	await expect.element(page.getByText("No notes yet.")).not.toBeInTheDocument();
	expect(container.querySelector("[data-notes]")?.children).toHaveLength(0);
});
