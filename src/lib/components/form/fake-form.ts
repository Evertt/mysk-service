/**
 * Stand-ins for remote form fields and forms in component tests, where remote functions can't
 * run. They return the same input attributes as SvelteKit's `field.as(…)`, with fixed issues.
 */
import type { RemoteForm, RemoteFormField, RemoteFormInput, RemoteFormIssue } from "$app/server";

const toIssues = (name: string, messages: string[]): RemoteFormIssue[] | undefined =>
	messages.length ? messages.map((message) => ({ message, path: [name] })) : undefined;

/** Passes for a field of any of the types the form components take. */
type AnyField = RemoteFormField<string> & RemoteFormField<number> & RemoteFormField<boolean>;

/**
 * A field named `name`, with `issues` as its validation messages. A checkbox with a string value is
 * one of a list's (`name[]`), checked if `checked` says so, as SvelteKit's `as("checkbox", value)`.
 */
export function fakeField(name: string, issues: string[] = []) {
	const field = {
		as(type: string, value?: string | number | boolean | null, checked?: boolean) {
			const base = { name, "aria-invalid": issues.length ? ("true" as const) : undefined };
			if (type === "select") return { ...base, multiple: false, value };
			if (type === "checkbox" && typeof value === "string") {
				return { ...base, name: `${name}[]`, type, value, checked: checked ?? false };
			}
			if (type === "checkbox") return { ...base, type, checked: value ?? false };
			if (type === "hidden") return { ...base, type, value };
			return { ...base, ...(type === "text" ? {} : { type }), value: String(value ?? "") };
		},
		issues: () => toIssues(name, issues),
		allIssues: () => toIssues(name, issues),
	};
	return field as unknown as AnyField;
}

interface FakeFormOptions {
	/** The form's validation messages, e.g. why the server refused it. */
	issues?: string[];
	pending?: number;
	/** Called with the submitted data instead of sending it. */
	onsubmit?: (data: FormData) => void;
}

/**
 * A remote form with the fields `fields`, and `issues` as the form's validation messages.
 * Submitting it calls `onsubmit` with the submitted data instead of sending it.
 */
export function fakeForm<Input extends RemoteFormInput>(
	fields: (keyof Input & string)[],
	{ issues = [], pending = 0, onsubmit }: FakeFormOptions = {},
) {
	const form = {
		method: "POST",
		action: "?/remote=fake",
		onsubmit(event: SubmitEvent) {
			event.preventDefault();
			onsubmit?.(new FormData(event.currentTarget as HTMLFormElement));
		},
	};
	const [first = "form"] = fields;
	// Like a real remote form, only the attributes for `<form {...form}>` are enumerable.
	Object.defineProperties(form, {
		fields: {
			value: {
				...Object.fromEntries(fields.map((name) => [name, fakeField(name)])),
				allIssues: () => toIssues(first, issues),
			},
		},
		pending: { value: pending },
	});
	return form as unknown as RemoteForm<Input, unknown>;
}

/** A remote form taking an `id` (see `fakeForm`). */
export const fakeIdForm = (options: FakeFormOptions = {}) =>
	fakeForm<{ id: string }>(["id"], options);
