/**
 * The parts the modules add to core forms (see `defineFormSlot()` in `./define.ts`): each module's
 * inputs, under the form's `modules.<key>` (its module id in camel case, `formPartKey()`), with the schema of its part from
 * `src/modules/<id>/form-parts/<point id>.ts`, which the generator lists in `form-parts.gen.ts`.
 *
 * A form makes its `modules` field with `formPartsSchema(<its form slot's id>)`: static, so it goes
 * in `form(schema, …)` at module scope and in the browser's `preflight()`, and exactly typed, by
 * module. Every module's part is optional in it: a part that isn't rendered isn't submitted. The
 * server's handler refuses the parts of modules the tenant doesn't have (`refuseOffParts()` in
 * `#lib/server/forms.ts`); whether an enabled module's part is required is the module's call, where
 * it saves its part. Isomorphic.
 */
import type { RemoteFormFields } from "$app/server";
import * as v from "valibot";

import type { FormPartSchema } from "./define.ts";
import { formPartKey } from "./form-part-key.ts";
import { formParts } from "./form-parts.gen.ts";

type FormParts = typeof formParts;

/** A form slot's id, e.g. `orders.form`. */
type FormSlotId = keyof FormParts;

/**
 * The schema of a form's `modules` field: each module's part, optional, by module id. Absent when
 * the form has no module's inputs.
 */
type FormPartsSchema<Id extends FormSlotId> = v.OptionalSchema<
	v.ObjectSchema<
		{
			[Module in keyof FormParts[Id]]: FormParts[Id][Module] extends FormPartSchema
				? v.OptionalSchema<FormParts[Id][Module], undefined>
				: never;
		},
		undefined
	>,
	undefined
>;

/** What a form's `modules` field holds once validated: each module's part, if it was submitted. */
export type FormPartsOutput<Id extends FormSlotId> = NonNullable<
	v.InferOutput<FormPartsSchema<Id>>
>;

/** The fields of a form's `modules` field, which the form slot hands each module its part of. */
export type FormPartsFields<Id extends FormSlotId> = RemoteFormFields<
	v.InferInput<FormPartsSchema<Id>>
>;

/** The schema of the `modules` field of the form whose form slot is `id`, from its modules' parts. */
export function formPartsSchema<Id extends FormSlotId>(id: Id): FormPartsSchema<Id> {
	const parts: Readonly<Record<string, FormPartSchema>> = formParts[id];
	const entries = Object.fromEntries(
		Object.entries(parts).map(([module, part]) => [module, v.optional(part)]),
	);
	return v.optional(v.object(entries)) as unknown as FormPartsSchema<Id>;
}

/**
 * A form's `schema` for the browser's `preflight()` that reports only the issues of the modules'
 * parts (under `modules`), typed as the form's own schema: the form's own fields are left to the
 * server, so a form that preflights its parts answers its own fields as it did.
 */
export function preflightParts<Schema extends v.GenericSchema>(
	schema: Schema,
): { readonly "~standard": v.StandardProps<v.InferInput<Schema>, v.InferOutput<Schema>> } {
	return {
		"~standard": {
			version: 1,
			vendor: "valibot",
			async validate(value) {
				const result = await schema["~standard"].validate(value);
				const issues = result.issues?.filter(({ path }) => {
					const [first] = path ?? [];
					return (typeof first === "object" ? first.key : first) === "modules";
				});
				return issues?.length
					? { issues }
					: { value: (result.issues ? value : result.value) as v.InferOutput<Schema> };
			},
		},
	};
}

/**
 * The parts of a form (`parts`, its `modules` field) submitted by modules that aren't `enabled` (by
 * their keys, `formPartKey()`).
 */
export function partsOfModulesOff(
	parts: Readonly<Record<string, unknown>>,
	enabled: readonly string[],
): string[] {
	const keys = enabled.map(formPartKey);
	return Object.keys(parts).filter((key) => parts[key] !== undefined && !keys.includes(key));
}
