/**
 * One way to lay out a record's page and its form, and to title a page:
 *
 * - `RecordPage` (`#lib/components/record-page.svelte`) lays out every record's page: its header,
 *   the notice of changes elsewhere, the two columns (`lg:grid-cols-3` with a main column that
 *   spans two), the modules' slots and the activity card. So no other page lays out those columns
 *   by hand.
 * - `PageHeader` titles the browser tab, so a page with a header (or a `RecordPage`) writes no
 *   `<title>` of its own.
 * - `RecordForm` (`#lib/components/form/record-form.svelte`) frames a record's form: its snapshot,
 *   its hidden id, the toast and the buttons. So a form casts to neither of its two remote forms
 *   (`form as typeof updateX`) to reach the other's fields: its props are a union of the two.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** The app's components, by path from the root. */
const components = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
	.map((file) => `src/${file}`)
	.filter((file) => file.endsWith(".svelte") && !file.startsWith("src/tests/"));

const read = (file: string) => readFileSync(join(root, file), "utf8");

/**
 * Whether `source` lays out a record page's two columns of cards by hand (a skeleton of them, of
 * `Skeleton`s, is no page).
 */
const handLaidColumns = (source: string) =>
	/\blg:grid-cols-3\b/.test(source) && /\blg:col-span-2\b/.test(source) && /<Card\./.test(source);

/** Whether `source` writes a `<title>` beside a header that titles the tab already. */
const titledTwice = (source: string) =>
	/<svelte:head>[\s\S]*?<title[\s>]/.test(source) && /<(PageHeader|RecordPage)\b/.test(source);

/** The lines of `source` that cast a form to one of its remote forms. */
const formCasts = (source: string) =>
	source
		.split("\n")
		.flatMap((line, index) =>
			/\bas typeof (create|update)[A-Z]\w*\)/.test(line) ? [index + 1] : [],
		);

test("record pages are laid out with RecordPage", () => {
	const found = components.filter(
		(file) => file !== "src/lib/components/record-page.svelte" && handLaidColumns(read(file)),
	);
	expect(found).toEqual([]);
});

test("a page with a header writes no title of its own", () => {
	const found = components.filter(
		(file) => file !== "src/lib/components/page-header.svelte" && titledTwice(read(file)),
	);
	expect(found).toEqual([]);
});

test("record forms take their remote forms as a union, without casts", () => {
	const found = components.flatMap((file) =>
		formCasts(read(file)).map((line) => `${file}:${line}`),
	);
	expect(found).toEqual([]);
});

test("tells a hand-laid record page, a title beside a header and a form cast", () => {
	const columns = `<div class="grid lg:grid-cols-3">\n<div class="lg:col-span-2"><Card.Root>`;
	expect(handLaidColumns(columns)).toBe(true);
	expect(handLaidColumns(`<div class="grid lg:grid-cols-3"><Skeleton />`)).toBe(false);

	const title = `<svelte:head>\n\t<title>{m.orders_title()}</title>\n</svelte:head>`;
	expect(titledTwice(`${title}\n<PageHeader title="Orders" />`)).toBe(true);
	expect(titledTwice(`${title}\n<RecordPage title="WO-1" />`)).toBe(true);
	expect(titledTwice(`${title}\n<h1>Dashboard</h1>`)).toBe(false);
	expect(titledTwice(`<svelte:head><link rel="icon" /></svelte:head>\n<PageHeader />`)).toBe(false);

	expect(
		formCasts(`<input {...(form as typeof updateOrder).fields.id.as("hidden", id)} />`),
	).toEqual([1]);
	expect(formCasts(`const fields = form.fields;`)).toEqual([]);
});
