/**
 * The forms `RecordForm` takes: a record's create and update forms (SvelteKit's `RemoteForm`), or
 * either of the two, for a form component that does both.
 */
import type { RemoteForm, RemoteFormIssue, RemoteQueryUpdate } from "$app/server";
import type { HTMLInputAttributes } from "svelte/elements";

import type { HiddenInputs } from "./dialogs.svelte.ts";

/** What `RecordForm` uses of a remote form. */
export interface RecordFormLike {
	readonly pending: number;
	enhance(
		callback: (submission: {
			submit(): Promise<boolean> & { updates(...updates: RemoteQueryUpdate[]): Promise<boolean> };
		}) => Promise<void>,
	): ReturnType<RemoteForm<never, unknown>["enhance"]>;
	/** Checks the input in the browser before submitting it (`preflight`). */
	preflight(schema: Parameters<RemoteForm<never, unknown>["preflight"]>[0]): RecordFormLike;
	readonly fields: {
		issues(): RemoteFormIssue[] | undefined;
		value(): unknown;
		set(value: never): unknown;
		/** An update form's: the record's id, in a hidden input. */
		readonly id?: { as(type: "hidden", value: string): HTMLInputAttributes };
	};
}

/**
 * The record a `Form` edits, by its id, for its hidden `id` input: only a form with an `id` field
 * (an update form, or either of a create and an update form) takes one.
 */
export type EditedRecord<Form> = "id" extends keyof HiddenInputs<Form> ? { id: number } : never;
