/**
 * How the values in the activity log's entries read: the labels of fields, and their old and new
 * values as text (`describeChanges()`), with the names of the records they refer to. The sentences
 * and the subject types (nouns, pages and per-field formats) are in `#lib/activity/subjects.ts`.
 *
 * Fields without a format of their own still show, with a label from `fieldLabels` (or made from
 * their name) and their value as stored (dates and numbers formatted).
 */
// Only types from `#lib/activity/subjects.ts`, which uses this file's types in turn.
import type { FieldFormat, SubjectType, Text } from "#lib/activity/index.ts";
import { formatDate, formatDateTime, formatNumber } from "#lib/i18n/index.ts";
import { modules } from "#lib/modules/manifests.ts";

/** Records whose ids a field can refer to; the feed shows their names instead (see `Names`). */
const referenceTypes = ["customer", "engineer", "equipment"] as const;
export type ReferenceType = (typeof referenceTypes)[number];

/** The names of referenced records by type and id, e.g. `{ engineer: { "3": "Jan de Vries" } }`. */
export type Names = Partial<Record<ReferenceType, Record<string, string>>>;

/**
 * The labels of the core's fields, by field name, whatever the subject (an optional module's are on
 * its subject types); a subject type's `fields` can give another (e.g. a unit's customer is its
 * "owner").
 */
const fieldLabels: Record<string, Text> = {
	code: m.activity_field_code,
	name: m.activity_field_name,
	contactName: m.activity_field_contact_name,
	email: m.activity_field_email,
	phone: m.activity_field_phone,
	city: m.activity_field_city,
	country: m.activity_field_country,
	segment: m.activity_field_segment,
	specialty: m.activity_field_specialty,
	region: m.activity_field_region,
	hourlyRate: m.activity_field_hourly_rate,
	active: m.activity_field_active,
	hiredAt: m.activity_field_hired_at,
	account: m.activity_field_account,
	serialNumber: m.activity_field_serial_number,
	model: m.activity_field_model,
	manufacturer: m.activity_field_manufacturer,
	category: m.activity_field_category,
	status: m.activity_field_status,
	customerId: m.activity_field_customer,
	installedAt: m.activity_field_installed_at,
	warrantyUntil: m.activity_field_warranty_until,
	number: m.activity_field_number,
	equipmentId: m.activity_field_equipment,
	equipmentIds: m.activity_field_equipment,
	engineerId: m.activity_field_engineer,
	type: m.activity_field_type,
	priority: m.activity_field_priority,
	description: m.activity_field_description,
	scheduledFor: m.activity_field_scheduled_for,
	completedAt: m.activity_field_completed_at,
	laborHours: m.activity_field_labor_hours,
	notes: m.activity_field_notes,
	role: m.activity_field_role,
};

/**
 * The label a module gives a field of its records, whether or not the tenant has the module (any
 * more): its entries in the log keep reading the same.
 */
const moduleFieldLabel = (field: string) =>
	modules
		.flatMap((module) => ("subjects" in module ? Object.values(module.subjects) : []))
		.find((type) => type.fields?.[field]?.label)?.fields?.[field]?.label ?? null;

/** A field's label: "engineer" for `engineerId`, "scheduled for" for `scheduledFor`. */
export function fieldLabel(field: string, format?: FieldFormat) {
	const known =
		format?.label ??
		(Object.hasOwn(fieldLabels, field) ? fieldLabels[field] : moduleFieldLabel(field));
	if (known) return known();
	return field
		.replace(/Ids?$/, "")
		.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)
		.replaceAll("_", " ")
		.trim();
}

const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** An id as text, as `Names` has them. */
const idText = (value: unknown) =>
	typeof value === "object" ? JSON.stringify(value) : String(value as string | number);

/** Shows a value of a field as logged: "—" for nothing, names for references (see `Names`). */
export function formatValue(value: unknown, format: FieldFormat = {}, names: Names = {}): string {
	if (value === null || value === undefined || value === "") return "—";
	if (Array.isArray(value)) {
		return value.length ? value.map((item) => formatValue(item, format, names)).join(", ") : "—";
	}
	if (format.ref) return names[format.ref]?.[idText(value)] ?? `#${idText(value)}`;
	if (format.format) return format.format(value);
	if (typeof value === "boolean") return value ? m.activity_value_yes() : m.activity_value_no();
	if (typeof value === "number") return formatNumber(value);
	if (typeof value === "string" && isoDate.test(value)) {
		const date = new Date(value);
		// A date (e.g. from a date input) is local midnight; anything else is a moment.
		const midnight = !date.getHours() && !date.getMinutes() && !date.getSeconds();
		return midnight ? formatDate(date) : formatDateTime(date);
	}
	const text = typeof value === "string" ? value : JSON.stringify(value);
	return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

export interface Change {
	field: string;
	before: string;
	after: string;
}

/** An update's changes (`{ field: [before, after] }`) as text, in the order they were logged. */
export function describeChanges(
	changes: Record<string, [unknown, unknown]> | null | undefined,
	type?: SubjectType,
	names: Names = {},
): Change[] {
	return Object.entries(changes ?? {}).map(([field, [before, after]]) => {
		const format = type?.fields?.[field];
		return {
			field: fieldLabel(field, format),
			before: formatValue(before, format, names),
			after: formatValue(after, format, names),
		};
	});
}

/** The ids each field of `changes` refers to, by type, to look up their names. */
export function referencedIds(
	changes: Record<string, [unknown, unknown]> | null | undefined,
	type: SubjectType | undefined,
	into: Map<ReferenceType, Set<string>> = new Map(),
) {
	for (const [field, values] of Object.entries(changes ?? {})) {
		const ref = type?.fields?.[field]?.ref;
		if (!ref) continue;
		const ids = into.get(ref) ?? new Set<string>();
		for (const value of values.flat()) {
			if (value !== null && value !== undefined && value !== "") ids.add(idText(value));
		}
		into.set(ref, ids);
	}
	return into;
}
