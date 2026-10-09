/**
 * How the activity log (`activity`, written by `recordActivity()` in `#lib/server/activity/log.ts`)
 * reads: a sentence per action, and per subject type its noun, its page and how its fields show,
 * e.g. "Anouk de Vries updated order ORD-2026-00012 · status: Scheduled → In progress", in Dutch
 * "Anouk de Vries heeft opdracht ORD-2026-00012 bijgewerkt · status: Ingepland → In uitvoering".
 *
 * The log stores values (the action, field names, raw values); they're translated here when shown.
 * The texts are in `messages/<locale>/activity.json`. Nouns and labels are message functions, so
 * they're read in the current language when shown, never at module scope.
 *
 * A new subject type gets an entry in `coreSubjectTypes` here, or, for an optional module's
 * records, in its `subjects` in `#lib/modules/manifests.ts`; likewise its verbs go in its `actions`. How
 * their fields and values read is in `#lib/activity/format.ts`.
 */
import { resolve } from "$app/paths";

import { parseRoles } from "#lib/auth";
import {
	formatCents,
	formatDate,
	formatDateTime,
	hasLabel,
	label,
	type LabelKind,
	labelOrValue,
} from "#lib/i18n";
import type { CoreActivityAction } from "#lib/models.ts";
import { type AppModule, modules } from "#lib/modules/manifests.ts";
import { m } from "#lib/paraglide/messages.js";

import type { ReferenceType } from "./format.ts";

/** A text in the current language, read when it's shown. */
export type Text = () => string;

/** An entry's sentence, with who did it and the subject (its noun and label) as variables. */
export type Sentence = (inputs: { user: string; subject: string }) => string;

/** What the user did, as in "Anouk de Vries updated order …": a sentence per action. */
export const actionVerbs: Record<CoreActivityAction, Sentence> = {
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
	shared: m.activity_action_shared,
	unshared: m.activity_action_unshared,
};

/**
 * The sentence of an action as logged: the core's, or one of an optional module's `actions` (of
 * all modules, not only the tenant's, so the log keeps reading the same after a module is switched
 * off); one this version doesn't know reads as its value.
 */
export const actionSentence = (action: string): Sentence => {
	if (Object.hasOwn(actionVerbs, action)) return actionVerbs[action as CoreActivityAction];
	const actions = (modules as readonly AppModule[]).find((module) =>
		Object.hasOwn(module.actions ?? {}, action),
	)?.actions;
	return actions?.[action] ?? ((inputs) => m.activity_action_other({ ...inputs, action }));
};

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
	parseRoles(String(value))
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
	/** An optional module (`#lib/modules/manifests.ts`), by its id; shown by its name. */
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
