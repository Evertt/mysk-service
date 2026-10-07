import type { SlaState } from "#lib/components/contracts/coverage.js";
/**
 * The translated names of the domain's enum values (statuses, types, units, roles, …): the one
 * place that maps a stored value to what users read. Show one with `label("orderStatus", status)`;
 * build select or filter options with `labelOptions("orderStatus", orderStatuses)`.
 *
 * Labels are read when they're shown, in the current language, so these are safe to use at module
 * scope only through `withLabels`/`labelOptions`, whose `label` is a getter. Never store the text of
 * a label: store the value.
 */
import type { InvoiceState } from "#lib/components/invoicing/invoice.js";
import type { StockLevel } from "#lib/components/materials/display.js";
import type {
	ContractLevel,
	ContractStatus,
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

type Labels<T extends string> = Record<T, () => string>;

const labels = {
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
	contractLevel: {
		basic: m.enum_contract_level_basic,
		standard: m.enum_contract_level_standard,
		premium: m.enum_contract_level_premium,
	} satisfies Labels<ContractLevel>,
	contractStatus: {
		upcoming: m.enum_contract_status_upcoming,
		active: m.enum_contract_status_active,
		expired: m.enum_contract_status_expired,
	} satisfies Labels<ContractStatus>,
	slaState: {
		on_track: m.enum_sla_state_on_track,
		at_risk: m.enum_sla_state_at_risk,
		overdue: m.enum_sla_state_overdue,
		responded: m.enum_sla_state_responded,
	} satisfies Labels<SlaState>,
	invoiceState: {
		draft: m.enum_invoice_state_draft,
		sent: m.enum_invoice_state_sent,
		overdue: m.enum_invoice_state_overdue,
		paid: m.enum_invoice_state_paid,
		void: m.enum_invoice_state_void,
	} satisfies Labels<InvoiceState>,
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

export type LabelKind = keyof typeof labels;
/** The values a kind of label has, e.g. the order statuses for `orderStatus`. */
export type LabelValue<K extends LabelKind> = keyof (typeof labels)[K] & string;

/** Whether `value` is one of a kind's values, e.g. a role read from the database. */
export const hasLabel = <K extends LabelKind>(kind: K, value: string): value is LabelValue<K> =>
	Object.hasOwn(labels[kind], value);

/** The translated label of an enum value, e.g. `label("orderStatus", "in_progress")` → `In progress`. */
export const label = <K extends LabelKind>(kind: K, value: LabelValue<K>): string =>
	(labels[kind] as Labels<string>)[value]();

/**
 * The label of a value that may be unknown (e.g. a role stored by an older version): the value
 * itself if there's no label for it.
 */
export const labelOrValue = (kind: LabelKind, value: string) =>
	hasLabel(kind, value) ? label(kind, value) : value;

/** `entry` with a `label` getter, so the label is translated when it's read. */
const withLabel = <T extends object>(entry: T, get: () => string) =>
	Object.defineProperty({ ...entry }, "label", { get, enumerable: true }) as T & {
		readonly label: string;
	};

/**
 * Adds each value's translated `label` to a map of display details, e.g. icons and badge variants:
 * `withLabels("orderStatus", { quote: { icon, variant }, … })[status].label`.
 */
export function withLabels<K extends LabelKind, E extends Record<LabelValue<K>, object>>(
	kind: K,
	entries: E,
) {
	return Object.fromEntries(
		Object.entries(entries).map(([value, entry]) => [
			value,
			withLabel(entry as object, () => label(kind, value as LabelValue<K>)),
		]),
	) as { [V in keyof E]: E[V] & { readonly label: string } };
}

/**
 * Options for a select or faceted filter: `{ value, label }` for each of `values`, in order, plus
 * the value's entry in `details` (e.g. its icon) if given.
 */
export function labelOptions<
	K extends LabelKind,
	V extends LabelValue<K>,
	D extends object = Record<never, never>,
>(kind: K, values: readonly V[], details?: Record<V, D>) {
	return values.map((value) =>
		withLabel({ ...details?.[value], value }, () => label(kind, value)),
	) as (Omit<D, "label"> & { value: V; readonly label: string })[];
}
