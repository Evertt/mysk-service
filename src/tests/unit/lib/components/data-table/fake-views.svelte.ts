import type { TableView } from "#lib/components/data-table/views.remote.ts";
/**
 * A stand-in for `views.remote.ts` in component tests of tables, where remote functions can't run:
 * the views are `saved` (none unless a test adds some), and what the menu sends is recorded in
 * `sent` instead.
 *
 * ```ts
 * vi.mock("#lib/components/data-table/views.remote.ts", () => import("./fake-views.svelte.ts"));
 * ```
 */
import { fakeField } from "#unit/lib/components/form/fake-form.ts";

export type { TableView };

/** The views the menu gets, and whether the user may share them. */
export const saved = $state({ canShare: false, views: [] as TableView[] });

/** What the menu sent, oldest first: the forms' data and the commands' arguments. */
export const sent: { name: string; data: unknown }[] = [];

/** Starts over without views. */
export function reset(views: TableView[] = [], canShare = false) {
	saved.views = views;
	saved.canShare = canShare;
	sent.length = 0;
}

export const getTableViews = async (_key: string) => saved;

/** A remote form whose submissions go into `sent`. */
function fakeForm(name: string) {
	const instance = () => {
		const attributes = {
			method: "POST",
			action: `?/remote=${name}`,
			onsubmit(event: SubmitEvent) {
				event.preventDefault();
				const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));
				sent.push({ name, data });
			},
		};
		return {
			...attributes,
			enhance: () => attributes,
			fields: Object.fromEntries(
				["id", "tableKey", "query", "name", "shared"].map((field) => [field, fakeField(field)]),
			),
			pending: 0,
			result: undefined,
		};
	};
	return { for: instance };
}

/** A command whose calls go into `sent`. */
const fakeCommand =
	(name: string) =>
	async (data: unknown): Promise<void> => {
		sent.push({ name, data });
	};

export const createView = fakeForm("createView");
export const renameView = fakeForm("renameView");
export const updateView = fakeCommand("updateView");
export const shareView = fakeCommand("shareView");
export const deleteView = fakeCommand("deleteView");
