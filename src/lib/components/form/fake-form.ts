/**
 * Stand-ins for remote form fields and forms in component tests, where remote functions can't
 * run. They return the same input attributes as SvelteKit's `field.as(…)`, with fixed issues.
 */
import type { RemoteForm, RemoteFormField, RemoteFormIssue } from "$app/server";

const toIssues = (name: string, messages: string[]): RemoteFormIssue[] | undefined =>
	messages.length ? messages.map((message) => ({ message, path: [name] })) : undefined;

/** Passes for a field of any of the types the form components take. */
type AnyField = RemoteFormField<string> & RemoteFormField<number> & RemoteFormField<boolean>;

/** A field named `name`, with `issues` as its validation messages. */
export function fakeField(name: string, issues: string[] = []) {
	const field = {
		as(type: string, value?: string | number | boolean | null) {
			const base = { name, "aria-invalid": issues.length ? ("true" as const) : undefined };
			if (type === "select") return { ...base, multiple: false, value };
			if (type === "checkbox") return { ...base, type, checked: value ?? false };
			if (type === "hidden") return { ...base, type, value };
			return { ...base, ...(type === "text" ? {} : { type }), value: String(value ?? "") };
		},
		issues: () => toIssues(name, issues),
		allIssues: () => toIssues(name, issues),
	};
	return field as unknown as AnyField;
}

/**
 * A remote form taking an `id`, with `issues` as the form's validation messages. Submitting it
 * calls `onsubmit` with the submitted data instead of sending it.
 */
export function fakeIdForm({
	issues = [],
	pending = 0,
	onsubmit,
}: {
	issues?: string[];
	pending?: number;
	onsubmit?: (data: FormData) => void;
} = {}) {
	const form = {
		method: "POST",
		action: "?/remote=delete",
		onsubmit(event: SubmitEvent) {
			event.preventDefault();
			onsubmit?.(new FormData(event.currentTarget as HTMLFormElement));
		},
	};
	// Like a real remote form, only the attributes for `<form {...form}>` are enumerable.
	Object.defineProperties(form, {
		fields: { value: { id: fakeField("id"), allIssues: () => toIssues("id", issues) } },
		pending: { value: pending },
	});
	return form as unknown as RemoteForm<{ id: string }, unknown>;
}
