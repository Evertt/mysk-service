/**
 * The translated names of the domain's enum values (statuses, types, units, roles, …): the one
 * place that maps a stored value to what users read. Show one with `label("orderStatus", status)`;
 * build select or filter options with `labelOptions("orderStatus", orderStatuses)`.
 *
 * Labels are read when they're shown, in the current language, so these are safe to use at module
 * scope only through `withLabels`/`labelOptions`, whose `label` is a getter. Never store the text of
 * a label: store the value.
 */
import type { StockLevel } from "#lib/components/materials/display.js";
import type {
	CustomerSegment,
	EngineerSpecialty,
	EquipmentCategory,
	EquipmentStatus,
	MaterialUnit,
	OrderPriority,
	OrderStatus,
	OrderType,
	StockMovementKind,
} from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";
import type { MemberRole } from "#lib/roles.js";

export type Labels<T extends string> = Record<T, () => string>;

const coreLabels = {
	orderStatus: {
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
		installation: m.enum_order_type_installation,
		maintenance: m.enum_order_type_maintenance,
		repair: m.enum_order_type_repair,
		inspection: m.enum_order_type_inspection,
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
	equipmentCategory: {
		generator: m.enum_equipment_category_generator,
		chiller: m.enum_equipment_category_chiller,
		boiler: m.enum_equipment_category_boiler,
		compressor: m.enum_equipment_category_compressor,
		pump: m.enum_equipment_category_pump,
		elevator: m.enum_equipment_category_elevator,
		air_handler: m.enum_equipment_category_air_handler,
	} satisfies Labels<EquipmentCategory>,
	equipmentStatus: {
		operational: m.enum_equipment_status_operational,
		needs_service: m.enum_equipment_status_needs_service,
		out_of_service: m.enum_equipment_status_out_of_service,
		decommissioned: m.enum_equipment_status_decommissioned,
	} satisfies Labels<EquipmentStatus>,
	/** A unit's name, e.g. `Pieces`. */
	materialUnit: {
		pcs: m.enum_material_unit_pcs,
		m: m.enum_material_unit_m,
		kg: m.enum_material_unit_kg,
		l: m.enum_material_unit_l,
	} satisfies Labels<MaterialUnit>,
	/** A unit's abbreviation after a quantity, e.g. `pcs` in `12 pcs`. */
	materialUnitSymbol: {
		pcs: m.enum_material_unit_symbol_pcs,
		m: m.enum_material_unit_symbol_m,
		kg: m.enum_material_unit_symbol_kg,
		l: m.enum_material_unit_symbol_l,
	} satisfies Labels<MaterialUnit>,
	stockLevel: {
		out: m.enum_stock_level_out,
		low: m.enum_stock_level_low,
		in_stock: m.enum_stock_level_in_stock,
	} satisfies Labels<StockLevel>,
	stockMovementKind: {
		opening_balance: m.enum_stock_movement_kind_opening_balance,
		receipt: m.enum_stock_movement_kind_receipt,
		adjustment: m.enum_stock_movement_kind_adjustment,
		consumption: m.enum_stock_movement_kind_consumption,
		return: m.enum_stock_movement_kind_return,
	} satisfies Labels<StockMovementKind>,
	memberRole: {
		owner: m.enum_member_role_owner,
		admin: m.enum_member_role_admin,
		member: m.enum_member_role_member,
		engineer: m.enum_member_role_engineer,
	} satisfies Labels<MemberRole>,
	/** What a role is for, e.g. to explain a choice of role. */
	memberRoleDescription: {
		owner: m.enum_member_role_description_owner,
		admin: m.enum_member_role_description_admin,
		member: m.enum_member_role_description_member,
		engineer: m.enum_member_role_description_engineer,
	} satisfies Labels<MemberRole>,
};

/**
 * Binds the label functions to a map of label kinds. The core's kinds are bound below; an optional
 * module defines its own next to its code (e.g. `#lib/components/contracts/labels.ts`), so this
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
/** The values a kind of label has, e.g. the order statuses for `orderStatus`. */
export type LabelValue<K extends LabelKind> = keyof (typeof coreLabels)[K] & string;

export const { hasLabel, label, labelOrValue, withLabels, labelOptions } = defineLabels(coreLabels);
