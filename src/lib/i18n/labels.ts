/**
 * The translated names of the domain's enum values (statuses, types, units, roles, …): the one
 * place that maps a stored value to what users read. Show one with `label("orderStatus", status)`;
 * build select or filter options with `labelOptions("orderStatus", orderStatuses)`.
 *
 * The maps are generated (`labels.gen.ts`, by `scripts/modules.ts`) from the enum arrays tagged
 * `@labels <kind>` in their doc comment (`orderStatuses` in `#lib/models.ts` names `orderStatus`):
 * each value's message is `enum_<kind>_<value>` in snake_case, `enum_order_status_in_progress`, in
 * `messages/<locale>/enum.json`; a module's are `<section>_enum_<kind>_<value>`.
 *
 * Labels are read when they're shown, in the current language, so these are safe to use at module
 * scope only through `withLabels`/`labelOptions`, whose `label` is a getter. Never store the text of
 * a label: store the value.
 */
import type { Locale } from "#lib/paraglide/runtime.js";

import { labels as coreLabels } from "./labels.gen.ts";

/**
 * A kind's map of each value to its message.
 * @public The generated `labels.gen.ts` files hold their maps to it, which knip doesn't see.
 */
export type Labels<T extends string> = Record<T, () => string>;

/**
 * The name a tenant gave a value in the current language, if it gave it one (e.g. its own name for
 * an order type, see `#lib/orders/types.ts`); `undefined` for the standard label.
 */
export type TenantName = (kind: string, value: string) => string | undefined;

let tenantName: TenantName = () => undefined;

/**
 * Makes `label()` (and everything made with it: `withLabels`, `labelOptions`, `labelOrValue`) show
 * the tenant's own names first: the request's tenant's on the server, the signed-in one's in the
 * browser. Called once per runtime; `get` is asked on every label, so it must answer from memory.
 */
export function overwriteTenantNames(get: TenantName) {
	tenantName = get;
}

/**
 * Binds the label functions to a map of label kinds. The core's kinds are bound below; an optional
 * module binds its own generated map next to its code (e.g. `src/modules/contracts/labels.ts`), so
 * this file doesn't import the modules.
 */
export function defineLabels<L extends Record<string, Record<string, () => string>>>(labels: L) {
	type Kind = keyof L & string;
	/** The values a kind of label has, e.g. the order statuses for `orderStatus`. */
	type Value<K extends Kind> = keyof L[K] & string;

	/** Whether `value` is one of a kind's values, e.g. a role read from the database. */
	const hasLabel = <K extends Kind>(kind: K, value: string): value is Value<K> =>
		Object.hasOwn(labels[kind], value);

	/**
	 * The translated label of an enum value, e.g. `label("orderStatus", "in_progress")` → `In progress`:
	 * the tenant's own name for it if it gave it one (see `overwriteTenantNames`).
	 */
	const label = <K extends Kind>(kind: K, value: Value<K>): string =>
		tenantName(kind, value) ?? (labels[kind] as Labels<string>)[value]();

	/**
	 * The label of a value that may be unknown (e.g. a role stored by an older version): the value
	 * itself if there's no label for it.
	 */
	const labelOrValue = (kind: Kind, value: string) =>
		hasLabel(kind, value) ? label(kind, value) : value;

	/**
	 * Adds each value's translated `label` to a map of display details, e.g. icons and badge variants:
	 * `withLabels("orderStatus", { quote: { icon, variant }, … })[status].label`.
	 */
	function withLabels<K extends Kind, E extends Record<Value<K>, object>>(kind: K, entries: E) {
		return Object.fromEntries(
			Object.entries(entries).map(([value, entry]) => [
				value,
				withLabel(entry as object, () => label(kind, value as Value<K>)),
			]),
		) as { [V in keyof E]: E[V] & { readonly label: string } };
	}

	/**
	 * Options for a select or faceted filter: `{ value, label }` for each of `values`, in order, plus
	 * the value's entry in `details` (e.g. its icon) if given.
	 */
	function labelOptions<
		K extends Kind,
		V extends Value<K>,
		D extends object = Record<never, never>,
	>(kind: K, values: readonly V[], details?: Record<V, D>) {
		return values.map((value) =>
			withLabel({ ...details?.[value], value }, () => label(kind, value)),
		) as (Omit<D, "label"> & { value: V; readonly label: string })[];
	}

	return { hasLabel, label, labelOrValue, withLabels, labelOptions };
}

/** `entry` with a `label` getter, so the label is translated when it's read. */
const withLabel = <T extends object>(entry: T, get: () => string) =>
	Object.defineProperty({ ...entry }, "label", { get, enumerable: true }) as T & {
		readonly label: string;
	};

export type LabelKind = keyof typeof coreLabels;

export const { hasLabel, label, labelOrValue, withLabels, labelOptions } = defineLabels(coreLabels);

/**
 * A core value's standard label in `locale` (the current language by default), whatever name the
 * tenant gave it: e.g. what a tenant's own name for an order type replaces.
 */
export const standardLabel = <K extends LabelKind>(
	kind: K,
	value: keyof (typeof coreLabels)[K] & string,
	locale?: Locale,
): string =>
	(coreLabels[kind] as Record<string, (inputs?: object, options?: { locale?: Locale }) => string>)[
		value
	]({}, { locale });
