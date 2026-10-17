/**
 * A tenant's own take on the order types. The types are a fixed set the app's logic relies on
 * (contract coverage, response times, checklists, corrective work), so a tenant never makes new
 * ones: it may give a type a name of its own in each language, and hide the types it doesn't use
 * from the order form (an order that has one keeps it, and shows it).
 *
 * The names take over from the standard labels everywhere a type is shown, because `label()`
 * asks for them (`nameOrderTypes()`): on the server from the request's tenant, which loads them
 * once with itself (`loadTenant()`), in the browser from `getOrderTypes()`, which each shell's
 * layout awaits. The stored values, the lists' filters and the URL keep the types' own ids.
 */
import { overwriteTenantNames, standardLabel } from "#lib/i18n/index.ts";
import { type OrderType, orderTypes } from "#lib/models.ts";
import { getLocale, type Locale, locales } from "#lib/paraglide/runtime.js";

/** What a tenant changed about one order type. */
export interface OrderTypeSetting {
	/** Its own name for the type, by language; a language without one shows the standard label. */
	names: Partial<Record<Locale, string>>;
	/** Left out of the order form (but an order's own type), and so from what's offered. */
	hidden: boolean;
}

/** A tenant's settings for the types it changed; a type without one is as standard. */
export type OrderTypeSettings = Partial<Record<OrderType, OrderTypeSetting>>;

/** The most a type's own name may have. */
export const orderTypeNameMax = 40;

/** The tenant's own name for `type` in `locale`, if it gave it one. */
const tenantTypeName = (
	settings: OrderTypeSettings | undefined,
	type: string,
	locale: Locale,
): string | undefined => settings?.[type as OrderType]?.names[locale] || undefined;

/** How `type` reads for the tenant in `locale`: its own name, or the standard label. */
export const typeName = (
	settings: OrderTypeSettings | undefined,
	type: OrderType,
	locale: Locale,
): string => tenantTypeName(settings, type, locale) ?? standardLabel("orderType", type, locale);

/**
 * Makes `label("orderType", …)` read the tenant's names from `settings()` (in the current
 * language), which must answer from memory: it's asked on every label.
 */
export function nameOrderTypes(settings: () => OrderTypeSettings | undefined) {
	overwriteTenantNames((kind, value) =>
		kind === "orderType" ? tenantTypeName(settings(), value, getLocale()) : undefined,
	);
}

/**
 * The types the order form offers, in their order: those the tenant didn't hide, and the order's
 * own type (`current`) if it did.
 */
export const offeredOrderTypes = (
	settings: OrderTypeSettings | undefined,
	current?: OrderType,
): OrderType[] => orderTypes.filter((type) => type === current || !settings?.[type]?.hidden);

/**
 * The settings as they work: a type something needs offered (`required`, e.g. a module's that's
 * on) is never hidden, also when it was hidden before that module was switched on.
 */
export function effectiveOrderTypes(
	settings: OrderTypeSettings,
	required: ReadonlySet<OrderType>,
): OrderTypeSettings {
	return Object.fromEntries(
		Object.entries(settings).map(([type, setting]) => [
			type,
			{ ...setting, hidden: setting.hidden && !required.has(type as OrderType) },
		]),
	);
}

/** Why a change to a type's settings is refused, and the field it's about. */
export type OrderTypeProblem =
	| { field: "hidden"; reason: "required"; by: string[] }
	| { field: "hidden"; reason: "last" }
	| { field: "names"; locale: Locale; reason: "taken"; name: string; other: OrderType };

/**
 * What's wrong with giving `type` the setting `next`, with the tenant's other settings as they are
 * (`settings`) and the types something needs offered (`required`: what needs each, by name): a type
 * that's needed can't be hidden, nor the last visible one, and no two types may read the same in a
 * language (whatever the case), so they can be told apart.
 */
export function orderTypeProblems(
	settings: OrderTypeSettings,
	type: OrderType,
	next: OrderTypeSetting,
	required: ReadonlyMap<OrderType, string[]>,
): OrderTypeProblem[] {
	const problems: OrderTypeProblem[] = [];
	const after: OrderTypeSettings = { ...settings, [type]: next };
	if (next.hidden) {
		const by = required.get(type);
		if (by?.length) problems.push({ field: "hidden", reason: "required", by });
		else if (orderTypes.every((other) => after[other]?.hidden)) {
			problems.push({ field: "hidden", reason: "last" });
		}
	}
	for (const locale of locales) {
		const name = typeName(after, type, locale);
		const other = orderTypes.find(
			(other) =>
				other !== type &&
				typeName(after, other, locale).toLocaleLowerCase(locale) === name.toLocaleLowerCase(locale),
		);
		if (other) problems.push({ field: "names", locale, reason: "taken", name, other });
	}
	return problems;
}
