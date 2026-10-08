/**
 * How the activity log (`activity`, written by `recordActivity()` in `#lib/server/activity.ts`)
 * reads: a sentence per action, and per subject type its noun, its page and how its fields show,
 * e.g. "Anouk de Vries updated order ORD-2026-00012 · status: Scheduled → In progress", in Dutch
 * "Anouk de Vries heeft opdracht ORD-2026-00012 bijgewerkt · status: Ingepland → In uitvoering".
 *
 * The log stores values (the action, field names, raw values); they're translated here when shown.
 * The texts are in `messages/<locale>/activity.json`. Nouns and labels are message functions, so
 * they're read in the current language when shown, never at module scope.
 *
 * A new subject type gets an entry in `coreSubjectTypes` here, or, for an optional module's
 * records, in its `subjects` in `#lib/modules.ts`. Fields without an entry still show, with a
 * label from `fieldLabels` (or made from their name) and their value as stored (dates and numbers
 * formatted).
 */
import { resolve } from "$app/paths";

import { formatCents, formatDate, formatDateTime, formatNumber } from "#lib/format.js";
import { hasLabel, label, type LabelKind, labelOrValue } from "#lib/i18n/labels.js";
import type { ActivityAction } from "#lib/models.js";
import { modules } from "#lib/modules.js";
import { m } from "#lib/paraglide/messages.js";

/** A text in the current language, read when it's shown. */
export type Text = () => string;

/** An entry's sentence, with who did it and the subject (its noun and label) as variables. */
type Sentence = (inputs: { user: string; subject: string }) => string;

/** What the user did, as in "Anouk de Vries updated order …": a sentence per action. */
export const actionVerbs: Record<ActivityAction, Sentence> = {
	created: m.activity_action_created,
	updated: m.activity_action_updated,
	deleted: m.activity_action_deleted,
	scheduled: m.activity_action_scheduled,
	stock_received: m.activity_action_stock_received,
	stock_adjusted: m.activity_action_stock_adjusted,
	module_enabled: m.activity_action_module_enabled,
	module_disabled: m.activity_action_module_disabled,
	work_started: m.activity_action_work_started,
	note_added: m.activity_action_note_added,
	completed: m.activity_action_completed,
	removed: m.activity_action_removed,
	sent: m.activity_action_sent,
	resent: m.activity_action_resent,
	cancelled: m.activity_action_cancelled,
	accepted: m.activity_action_accepted,
	issued: m.activity_action_issued,
	paid: m.activity_action_paid,
	voided: m.activity_action_voided,
	shared: m.activity_action_shared,
	unshared: m.activity_action_unshared,
};

/** The sentence of an action as logged; one this version doesn't know reads as its value. */
export const actionSentence = (action: string): Sentence =>
	Object.hasOwn(actionVerbs, action)
		? actionVerbs[action as ActivityAction]
		: (inputs) => m.activity_action_other({ ...inputs, action });

/** Records whose ids a field can refer to; the feed shows their names instead (see `Names`). */
export const referenceTypes = ["customer", "engineer", "equipment", "material"] as const;
export type ReferenceType = (typeof referenceTypes)[number];

/** The names of referenced records by type and id, e.g. `{ engineer: { "3": "Jan de Vries" } }`. */
export type Names = Partial<Record<ReferenceType, Record<string, string>>>;

export interface FieldFormat {
	/** E.g. "owner"; by default the field's entry in `fieldLabels`, or made from its name. */
	label?: Text;
	/** Shows a value (never an empty one: that's "—"). */
	format?: (value: unknown) => string;
	/** The field holds the id (or ids) of a record of this type: shows its name. */
	ref?: ReferenceType;
}

export interface SubjectType {
	/** Lower case and singular, as in "updated order ORD-…". */
	noun: Text;
	/**
	 * How a subject of this type reads, if not by the label it was logged with (e.g. a module, by
	 * its name in the current language).
	 */
	label?: (subject: { id: string; label: string }) => string;
	/** The subject's page, if it has one, from its id and latest label (see `subjectHref()`). */
	href?: (subject: { id: string; label: string }) => string;
	fields?: Record<string, FieldFormat>;
}

/**
 * The labels of the fields the app logs, by field name, whatever the subject; a subject type's
 * `fields` can give another (e.g. a unit's customer is its "owner").
 */
export const fieldLabels: Record<string, Text> = {
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
	sku: m.activity_field_sku,
	unit: m.activity_field_unit,
	unitPrice: m.activity_field_unit_price,
	stock: m.activity_field_stock,
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
	quantity: m.activity_field_quantity,
	level: m.activity_field_level,
	startsOn: m.activity_field_starts_on,
	endsOn: m.activity_field_ends_on,
	monthlyFee: m.activity_field_monthly_fee,
	responseHours: m.activity_field_response_hours,
	notes: m.activity_field_notes,
	paymentTermDays: m.activity_field_payment_term_days,
	vatRate: m.activity_field_vat_rate,
	issuedOn: m.activity_field_issued_on,
	dueOn: m.activity_field_due_on,
	paidOn: m.activity_field_paid_on,
	billFrom: m.activity_field_bill_from,
	role: m.activity_field_role,
};

/** A stored value made readable, e.g. `order_line` → "Order line". */
const humanize = (value: string) => {
	const text = value.replaceAll("_", " ");
	return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Formats an enum value by its translated label, e.g. `in_progress` → "In progress". */
const labelled =
	(kind: LabelKind) =>
	(value: unknown): string => {
		const text = String(value);
		return hasLabel(kind, text) ? label(kind, text) : humanize(text);
	};
const money = (value: unknown) => formatCents(Number(value));
const day = (value: unknown) => formatDate(new Date(String(value)));
const moment = (value: unknown) => formatDateTime(new Date(String(value)));
/** A number of hours, e.g. "2.5 h". */
const hours = (value: unknown) => m.common_count_hours_short({ count: Number(value) });
/** A member's roles as stored (`owner,engineer`), e.g. "Owner, Field engineer". */
const roles = (value: unknown) =>
	String(value)
		.split(",")
		.map((role) => role.trim())
		.map((role) => labelOrValue("memberRole", role))
		.join(", ");

export const coreSubjectTypes: Record<string, SubjectType> = {
	customer: {
		noun: m.activity_subject_customer,
		href: ({ label }) => resolve("/(app)/customers/[code]", { code: label }),
		fields: { segment: { format: labelled("customerSegment") } },
	},
	engineer: {
		noun: m.activity_subject_engineer,
		href: ({ id }) => resolve("/(app)/engineers/[id]", { id }),
		fields: {
			specialty: { format: labelled("engineerSpecialty") },
			hourlyRate: { format: money },
			hiredAt: { format: day },
		},
	},
	equipment: {
		noun: m.activity_subject_equipment,
		href: ({ label }) => resolve("/(app)/equipment/[serial]", { serial: label }),
		fields: {
			category: { format: labelled("equipmentCategory") },
			status: { format: labelled("equipmentStatus") },
			customerId: { label: m.activity_field_owner, ref: "customer" },
			installedAt: { format: day },
			warrantyUntil: { format: day },
		},
	},
	material: {
		noun: m.activity_subject_material,
		href: ({ label }) => resolve("/(app)/materials/[sku]", { sku: label }),
		fields: {
			unit: { format: labelled("materialUnit") },
			unitPrice: { format: money },
		},
	},
	order: {
		noun: m.activity_subject_order,
		href: ({ label }) => resolve("/(app)/orders/[number]", { number: label }),
		fields: {
			customerId: { ref: "customer" },
			equipmentId: { ref: "equipment" },
			engineerId: { ref: "engineer" },
			type: { format: labelled("orderType") },
			status: { format: labelled("orderStatus") },
			priority: { format: labelled("orderPriority") },
			scheduledFor: { format: moment },
			completedAt: { format: moment },
			laborHours: { format: hours },
		},
	},
	/** An order's materials, told apart by material: the subject's id is the material's. */
	order_line: { noun: m.activity_subject_order_line },
	/** An optional module (`#lib/modules.ts`), by its id; shown by its name. */
	module: {
		noun: m.activity_subject_module,
		label: ({ id, label }) => modules.find((module) => module.id === id)?.label ?? label,
		href: () => resolve("/(app)/settings"),
	},
	/** A member of the organization (`member`), by their name. */
	member: {
		noun: m.activity_subject_member,
		href: () => resolve("/(app)/settings/members"),
		fields: { role: { format: roles } },
	},
	/** An invitation to join the organization, by the email address it's for. */
	invitation: { noun: m.activity_subject_invitation, fields: { role: { format: roles } } },
	/**
	 * A data table's saved view, by its name. Only shared views are logged: personal ones concern
	 * nobody else. Its filters show as their URL parameters.
	 */
	saved_view: {
		noun: m.activity_subject_saved_view,
		fields: { query: { label: m.activity_field_query } },
	},
};

/**
 * The subject types of the core and of the `enabled` modules. Another module's records still
 * show, by their label, but without a link (its pages are a 404 for the tenant).
 */
export function subjectTypes(enabled: readonly string[]): Record<string, SubjectType> {
	return Object.assign(
		{},
		coreSubjectTypes,
		...modules.flatMap((module) =>
			"subjects" in module && enabled.includes(module.id) ? [module.subjects] : [],
		),
	);
}

/**
 * The page of a subject of `type`, by its id and latest label, if the type has pages. Only in
 * components: `resolve()` can't run in a query.
 */
export function subjectHref(type: string, subject: { id: string; label: string }) {
	const known = subjectTypes(modules.map((module) => module.id))[type];
	return known?.href?.(subject) ?? null;
}

/** A subject type's noun, e.g. "order line"; one without an entry is made from its name. */
export const subjectNoun = (type: string, known?: SubjectType) =>
	known?.noun() ?? humanize(type).toLowerCase();

/** How a subject type reads in the type filter, e.g. "Order line". */
export const subjectTypeLabel = (type: string, known?: SubjectType) =>
	humanize(subjectNoun(type, known));

/** A field's label: "engineer" for `engineerId`, "scheduled for" for `scheduledFor`. */
export function fieldLabel(field: string, format?: FieldFormat) {
	const known = format?.label ?? (Object.hasOwn(fieldLabels, field) ? fieldLabels[field] : null);
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
