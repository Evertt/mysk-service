import type { MemberRole } from "#lib/auth/index.ts";
/**
 * The translated names of the domain's enum values (statuses, types, units, roles, …): the one
 * place that maps a stored value to what users read. Show one with `label("orderStatus", status)`;
 * build select or filter options with `labelOptions("orderStatus", orderStatuses)`.
 *
 * Labels are read when they're shown, in the current language, so these are safe to use at module
 * scope only through `withLabels`/`labelOptions`, whose `label` is a getter. Never store the text of
 * a label: store the value.
 */
import type {
	ContactChannel,
	CustomerSegment,
	EngineerSpecialty,
	EquipmentStatus,
	OrderPriority,
	OrderStatus,
	OrderType,
	SitePriority,
	Weekday,
} from "#lib/models.ts";

export type Labels<T extends string> = Record<T, () => string>;

const coreLabels = {
	orderStatus: {
		awaiting_acceptance: m.enum_order_status_awaiting_acceptance,
		quote: m.enum_order_status_quote,
		scheduled: m.enum_order_status_scheduled,
		in_progress: m.enum_order_status_in_progress,
		completed: m.enum_order_status_completed,
		invoiced: m.enum_order_status_invoiced,
		cancelled: m.enum_order_status_cancelled,
	} satisfies Labels<OrderStatus>,
	orderPriority: {
		low: m.enum_order_priority_low,
		normal: m.enum_order_priority_normal,
		high: m.enum_order_priority_high,
		urgent: m.enum_order_priority_urgent,
	} satisfies Labels<OrderPriority>,
	orderType: {
		breakdown: m.enum_order_type_breakdown,
		repair: m.enum_order_type_repair,
		maintenance: m.enum_order_type_maintenance,
		inspection: m.enum_order_type_inspection,
		installation: m.enum_order_type_installation,
		survey: m.enum_order_type_survey,
		damage: m.enum_order_type_damage,
		project: m.enum_order_type_project,
		other: m.enum_order_type_other,
	} satisfies Labels<OrderType>,
	customerSegment: {
		enterprise: m.enum_customer_segment_enterprise,
		mid_market: m.enum_customer_segment_mid_market,
		small_business: m.enum_customer_segment_small_business,
	} satisfies Labels<CustomerSegment>,
	engineerSpecialty: {
		electrical: m.enum_engineer_specialty_electrical,
		mechanical: m.enum_engineer_specialty_mechanical,
		hvac: m.enum_engineer_specialty_hvac,
		plumbing: m.enum_engineer_specialty_plumbing,
		controls: m.enum_engineer_specialty_controls,
	} satisfies Labels<EngineerSpecialty>,

	equipmentStatus: {
		operational: m.enum_equipment_status_operational,
		needs_service: m.enum_equipment_status_needs_service,
		out_of_service: m.enum_equipment_status_out_of_service,
		decommissioned: m.enum_equipment_status_decommissioned,
	} satisfies Labels<EquipmentStatus>,
	contactChannel: {
		email: m.enum_contact_channel_email,
		phone: m.enum_contact_channel_phone,
		whatsapp: m.enum_contact_channel_whatsapp,
		portal: m.enum_contact_channel_portal,
	} satisfies Labels<ContactChannel>,
	weekday: {
		monday: m.enum_weekday_monday,
		tuesday: m.enum_weekday_tuesday,
		wednesday: m.enum_weekday_wednesday,
		thursday: m.enum_weekday_thursday,
		friday: m.enum_weekday_friday,
		saturday: m.enum_weekday_saturday,
		sunday: m.enum_weekday_sunday,
	} satisfies Labels<Weekday>,
	sitePriority: {
		normal: m.enum_site_priority_normal,
		high: m.enum_site_priority_high,
	} satisfies Labels<SitePriority>,
	/** A unit's name, e.g. `Pieces`. */
	memberRole: {
		owner: m.enum_member_role_owner,
		admin: m.enum_member_role_admin,
		member: m.enum_member_role_member,
		engineer: m.enum_member_role_engineer,
		customer: m.enum_member_role_customer,
	} satisfies Labels<MemberRole>,
	/** What a role is for, e.g. to explain a choice of role. */
	memberRoleDescription: {
		owner: m.enum_member_role_description_owner,
		admin: m.enum_member_role_description_admin,
		member: m.enum_member_role_description_member,
		engineer: m.enum_member_role_description_engineer,
		customer: m.enum_member_role_description_customer,
	} satisfies Labels<MemberRole>,
};

/**
 * Binds the label functions to a map of label kinds. The core's kinds are bound below; an optional
 * module defines its own next to its code (e.g. `src/modules/contracts/labels.ts`), so this
 * file doesn't import the modules.
 */
export function defineLabels<L extends Record<string, Record<string, () => string>>>(labels: L) {
	type Kind = keyof L & string;
	/** The values a kind of label has, e.g. the order statuses for `orderStatus`. */
	type Value<K extends Kind> = keyof L[K] & string;

	/** Whether `value` is one of a kind's values, e.g. a role read from the database. */
	const hasLabel = <K extends Kind>(kind: K, value: string): value is Value<K> =>
		Object.hasOwn(labels[kind], value);

	/** The translated label of an enum value, e.g. `label("orderStatus", "in_progress")` → `In progress`. */
	const label = <K extends Kind>(kind: K, value: Value<K>): string =>
		(labels[kind] as Labels<string>)[value]();

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
