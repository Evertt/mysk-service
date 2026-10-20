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
	/** Called with what an `enhance` callback passes to its submission's `updates(…)`. */
	onupdates?: (...updates: unknown[]) => void;
	/** What the server answers once it accepted the submission (`form.result`). */
	result?: unknown;
}

type EnhanceCallback = (submission: {
	form: HTMLFormElement;
	element: HTMLFormElement;
	data: FormData;
	readonly result: unknown;
	submit: () => Promise<boolean> & { updates: (...updates: unknown[]) => Promise<boolean> };
}) => unknown;

/**
 * A remote form with the fields `fields`, and `issues` as the form's validation messages.
 * Submitting it calls `onsubmit` with the submitted data instead of sending it, through the
 * callback of `enhance(callback)` if it has one, as SvelteKit does.
 */
export function fakeForm<Input extends RemoteFormInput>(
	fields: (keyof Input & string)[],
	{ issues = [], pending = 0, onsubmit, onupdates, result }: FakeFormOptions = {},
) {
	let enhanced: EnhanceCallback | undefined;
	let answered: unknown;
	const send = (data: FormData) => {
		onsubmit?.(data);
		const accepted = issues.length === 0;
		if (accepted) answered = result;
		const sent = Promise.resolve(accepted);
		return Object.assign(sent, {
			updates: (...updates: unknown[]) => {
				onupdates?.(...updates);
				return sent;
			},
		});
	};
	const form = {
		method: "POST",
		action: "?/remote=fake",
		onsubmit(event: SubmitEvent) {
			event.preventDefault();
			const element = event.currentTarget as HTMLFormElement;
			const data = new FormData(element);
			const submission = {
				form: element,
				element,
				data,
				submit: () => send(data),
				get result() {
					return answered;
				},
			};
			if (enhanced) void enhanced(submission);
			else void send(data);
		},
	};
	const [first = "form"] = fields;
	// Like a real remote form, only the attributes for `<form {...form}>` are enumerable.
	Object.defineProperties(form, {
		fields: {
			value: {
				...Object.fromEntries(fields.map((name) => [name, fakeField(name)])),
				issues: () => toIssues(first, issues),
				allIssues: () => toIssues(first, issues),
			},
		},
		pending: { value: pending },
		result: { get: () => answered },
		enhance: {
			value: (callback: EnhanceCallback) => {
				enhanced = callback;
				return form;
			},
		},
	});
	return form as unknown as RemoteForm<Input, unknown>;
}

/** A remote form taking an `id` (see `fakeForm`). */
export const fakeIdForm = (options: FakeFormOptions = {}) =>
	fakeForm<{ id: string }>(["id"], options);
