/**
 * How the activity log (`activity`, written by `recordActivity()` in `#lib/server/activity/log.ts`)
 * reads: a sentence per action, and per subject type its noun, its page and how its fields show,
 * e.g. "Anouk de Vries updated order ORD-2026-00012 · status: Scheduled → In progress", in Dutch
 * "Anouk de Vries heeft opdracht ORD-2026-00012 bijgewerkt · status: Ingepland → In behandeling".
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

import { parseRoles } from "#lib/auth/index.ts";
import {
	formatCents,
	formatNumber,
	formatStoredDay,
	formatStoredMoment,
	hasLabel,
	label,
	type LabelKind,
	labelOrValue,
} from "#lib/i18n/index.ts";
import type { CoreActivityAction } from "#lib/models.ts";
import { type AppModule, modules } from "#lib/modules/manifests.ts";

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
	rejected: m.activity_action_rejected,
	shared: m.activity_action_shared,
	unshared: m.activity_action_unshared,
	revoked: m.activity_action_revoked,
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
	/**
	 * The field holds a list of ids (with `ref`): a change shows the records added and removed by
	 * name ("added Deur 07, Deur 08; removed Deur 03"), or that they were put in another order.
	 */
	set?: boolean;
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
const day = formatStoredDay;
const moment = formatStoredMoment;
/** A saved view's columns (see `column-visibility.ts`): the hidden ones, by id. */
const hiddenColumns = (value: unknown) =>
	Object.entries((value ?? {}) as Record<string, boolean>)
		.filter(([, visible]) => !visible)
		.map(([id]) => id)
		.join(", ") || "—";
/** A number of hours, e.g. "2.5 h". */
const hours = (value: unknown) => m.common_count_hours_short({ count: Number(value) });
/** A member's roles as stored (`owner,engineer`), e.g. "Owner, Field engineer". */
const roles = (value: unknown) =>
	parseRoles(String(value))
		.map((role) => labelOrValue("memberRole", role))
		.join(", ");

/**
 * Legacy: before each tenant had categories of its own (`categoryId`), a unit's `category` was one
 * of these keys. Older entries logged them, and read by the labels the keys had then; any other
 * value reads as logged.
 */
const legacyCategories: Record<string, Text> = {
	generator: m.activity_legacy_category_generator,
	chiller: m.activity_legacy_category_chiller,
	boiler: m.activity_legacy_category_boiler,
	compressor: m.activity_legacy_category_compressor,
	pump: m.activity_legacy_category_pump,
	elevator: m.activity_legacy_category_elevator,
	air_handler: m.activity_legacy_category_air_handler,
};
const legacyCategory = (value: unknown) => {
	const text = String(value);
	return Object.hasOwn(legacyCategories, text) ? legacyCategories[text]() : text;
};

export const coreSubjectTypes: Record<string, SubjectType> = {
	customer: {
		noun: m.activity_subject_customer,
		href: ({ label }) => resolve("/(app)/customers/[code]", { code: label }),
		fields: { segment: { format: labelled("customerSegment") } },
	},
	/**
	 * One of a customer's sites, by its name, logged with its customer as its parent. It has no
	 * page of its own: it's on its customer's.
	 */
	site: {
		noun: m.activity_subject_site,
		fields: {
			contactChannel: { format: labelled("contactChannel") },
			preferredDay: { format: labelled("weekday") },
			priority: { format: labelled("sitePriority") },
		},
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
			categoryId: { ref: "category" },
			category: { format: legacyCategory },
			status: { format: labelled("equipmentStatus") },
			customerId: { label: m.activity_field_owner, ref: "customer" },
			siteId: { ref: "site" },
			locationId: { ref: "location" },
			installedAt: { format: day },
			warrantyUntil: { format: day },
		},
	},
	/**
	 * A location at one of a customer's sites (`equipment_location`), by its name, logged with the
	 * site's customer as its parent.
	 */
	location: {
		noun: m.activity_subject_location,
		href: ({ id }) => resolve("/(app)/equipment/locations/[id]", { id }),
	},
	/** One of the tenant's equipment categories, by its name; they're kept on the settings page. */
	equipment_category: {
		noun: m.activity_subject_equipment_category,
		href: () => resolve("/(app)/settings/equipment-categories"),
		fields: {
			specialty: { format: labelled("engineerSpecialty") },
			// From 0 in the database, from 1 as people count.
			position: { format: (value) => formatNumber(Number(value) + 1) },
		},
	},
	order: {
		noun: m.activity_subject_order,
		href: ({ label }) => resolve("/(app)/orders/[number]", { number: label }),
		fields: {
			customerId: { ref: "customer" },
			// Its unit, as orders had one at most until they had any number.
			equipmentId: { ref: "equipment" },
			// Its units in their order: the log names those added and removed.
			equipmentIds: { label: m.activity_field_units, ref: "unit", set: true },
			engineerId: { ref: "engineer" },
			type: { format: labelled("orderType") },
			status: { format: labelled("orderStatus") },
			priority: { format: labelled("orderPriority") },
			scheduledFor: { format: moment },
			completedAt: { format: moment },
			laborHours: { format: hours },
		},
	},
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
	 * A customer's contact's access to the customer portal, by the email address it's for; logged
	 * with their customer as its parent, so it's on the customer's page too.
	 */
	portal_contact: { noun: m.activity_subject_portal_contact },
	/**
	 * A token a module's integration endpoints take (`integration_token`), by its name, logged with
	 * its module as the parent. It's managed on the module's settings page.
	 */
	integration_token: { noun: m.activity_subject_integration_token },
	/**
	 * A data table's saved view, by its name. Only shared views are logged: personal ones concern
	 * nobody else. Its filters show as their URL parameters, its columns as the hidden ones' ids.
	 */
	saved_view: {
		noun: m.activity_subject_saved_view,
		fields: {
			query: { label: m.activity_field_query },
			columns: { label: m.activity_field_hidden_columns, format: hiddenColumns },
		},
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
