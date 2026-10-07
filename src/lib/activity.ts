/**
 * How the activity log (`activity`, written by `recordActivity()` in `#lib/server/activity.ts`)
 * reads: a phrase per action, and per subject type its noun, its page and how its fields show,
 * e.g. "Avery Admin updated order ORD-2026-00012 · status: Scheduled → In progress".
 *
 * A new subject type gets an entry in `coreSubjectTypes` here, or, for an optional module's
 * records, in its `subjects` in `#lib/modules.ts`. Fields without an entry still show, with a
 * label made from their name and their value as stored (dates and numbers formatted).
 */
import { resolve } from "$app/paths";

import { segments } from "#lib/components/customers/display.js";
import { specialties } from "#lib/components/engineers/display.js";
import { categories } from "#lib/components/equipment/display.js";
import { unitLabels } from "#lib/components/materials/display.js";
import { priorities, statuses, types } from "#lib/components/orders/display.js";
import { formatCents, formatDate, formatDateTime, formatNumber, humanize } from "#lib/format.js";
import type { ActivityAction } from "#lib/models.js";
import { modules } from "#lib/modules.js";
import { type MemberRole, roleLabels } from "#lib/roles.js";

/** What the user did, as in "Avery Admin updated order …". */
export const actionVerbs: Record<ActivityAction, string> = {
	created: "created",
	updated: "updated",
	deleted: "deleted",
	scheduled: "scheduled",
	stock_received: "received stock of",
	stock_adjusted: "adjusted the stock of",
	module_enabled: "enabled",
	module_disabled: "disabled",
	work_started: "started work on",
	note_added: "added a note to",
	completed: "completed",
	removed: "removed",
	sent: "sent",
	resent: "resent",
	cancelled: "cancelled",
	accepted: "accepted",
	issued: "issued",
	paid: "recorded the payment of",
	voided: "voided",
};

/** Records whose ids a field can refer to; the feed shows their names instead (see `Names`). */
export const referenceTypes = ["customer", "engineer", "equipment", "material"] as const;
export type ReferenceType = (typeof referenceTypes)[number];

/** The names of referenced records by type and id, e.g. `{ engineer: { "3": "Jan de Vries" } }`. */
export type Names = Partial<Record<ReferenceType, Record<string, string>>>;

export interface FieldFormat {
	/** E.g. "scheduled for"; by default made from the field's name (`engineerId` → "engineer"). */
	label?: string;
	/** Shows a value (never an empty one: that's "—"). */
	format?: (value: unknown) => string;
	/** The field holds the id (or ids) of a record of this type: shows its name. */
	ref?: ReferenceType;
}

export interface SubjectType {
	/** Lower case and singular, as in "updated order ORD-…". */
	noun: string;
	/** The subject's page, if it has one, from its id and latest label (see `subjectHref()`). */
	href?: (subject: { id: string; label: string }) => string;
	fields?: Record<string, FieldFormat>;
}

/** Formats an enum value by its display label, e.g. `in_progress` → "In progress". */
const labelled =
	(labels: Record<string, { label: string } | string>) =>
	(value: unknown): string => {
		const found = labels[String(value)];
		return typeof found === "string" ? found : (found?.label ?? humanize(String(value)));
	};
const money = (value: unknown) => formatCents(Number(value));
const day = (value: unknown) => formatDate(new Date(String(value)));
const moment = (value: unknown) => formatDateTime(new Date(String(value)));
/** A member's roles as stored (`owner,engineer`), e.g. "Owner, Field engineer". */
const roles = (value: unknown) =>
	String(value)
		.split(",")
		.map((role) => role.trim())
		.map((role) => roleLabels[role as MemberRole] ?? humanize(role))
		.join(", ");

export const coreSubjectTypes: Record<string, SubjectType> = {
	customer: {
		noun: "customer",
		href: ({ label }) => resolve("/(app)/customers/[code]", { code: label }),
		fields: {
			contactName: { label: "contact person" },
			segment: { format: labelled(segments) },
		},
	},
	engineer: {
		noun: "engineer",
		href: ({ id }) => resolve("/(app)/engineers/[id]", { id }),
		fields: {
			specialty: { format: labelled(specialties) },
			hourlyRate: { format: money },
			hiredAt: { label: "hired", format: day },
		},
	},
	equipment: {
		noun: "equipment",
		href: ({ label }) => resolve("/(app)/equipment/[serial]", { serial: label }),
		fields: {
			category: { format: labelled(categories) },
			status: { format: (value) => humanize(String(value)) },
			customerId: { label: "owner", ref: "customer" },
			installedAt: { label: "installed", format: day },
			warrantyUntil: { label: "warranty until", format: day },
		},
	},
	material: {
		noun: "material",
		href: ({ label }) => resolve("/(app)/materials/[sku]", { sku: label }),
		fields: {
			unit: { format: labelled(unitLabels) },
			unitPrice: { format: money },
		},
	},
	order: {
		noun: "order",
		href: ({ label }) => resolve("/(app)/orders/[number]", { number: label }),
		fields: {
			customerId: { ref: "customer" },
			equipmentId: { ref: "equipment" },
			engineerId: { ref: "engineer" },
			type: { format: labelled(types) },
			status: { format: labelled(statuses) },
			priority: { format: labelled(priorities) },
			scheduledFor: { format: moment },
			completedAt: { label: "completed", format: moment },
			laborHours: { label: "labour", format: (value) => `${formatNumber(Number(value))} h` },
		},
	},
	/** An order's materials, told apart by material: the subject's id is the material's. */
	order_line: { noun: "order line" },
	/** An optional module (`#lib/modules.ts`), by its id. */
	module: { noun: "module", href: () => resolve("/(app)/settings") },
	/** A member of the organization (`member`), by their name. */
	member: {
		noun: "member",
		href: () => resolve("/(app)/settings/members"),
		fields: { role: { format: roles } },
	},
	/** An invitation to join the organization, by the email address it's for. */
	invitation: { noun: "invitation", fields: { role: { format: roles } } },
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

/** How a subject type reads in the type filter, e.g. "Order line". */
export const subjectTypeLabel = (type: string, known?: SubjectType) =>
	humanize(known?.noun ?? type);

/** A field's label: "engineer" for `engineerId`, "scheduled for" for `scheduledFor`. */
export function fieldLabel(field: string, format?: FieldFormat) {
	if (format?.label) return format.label;
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
	if (typeof value === "boolean") return value ? "yes" : "no";
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
