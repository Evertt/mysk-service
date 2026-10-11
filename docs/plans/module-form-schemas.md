# Module form schemas: typed, validated parts of a core form

**Status:** implemented on branch `module-form-schemas` (October 2026).

## Problem

The materials module adds its order lines to core's order form through the form slot
`orders.form`, and saves them through the save hook `orders.saving`
(`module-dependencies-4-materials.md`). Its "Was it worth it?" names the cost:

- The part arrives in core's schema as `ModuleFormPart` (strings and numbers two levels deep,
  checked only for being an object), and the module casts the field proxy to its own shape.
- The browser doesn't know the lines' schema, and neither does SvelteKit's form validation on the
  server: a bad quantity comes back only from the save hook, after core's own checks, as an
  `OrderProblem` turned into an `invalid()` issue.
- A part from a module the tenant doesn't have is ignored by the save hook. (The plan thought this
  path unreachable, since SvelteKit refuses a field its form didn't make with a 500,
  `form_field_unbound`. That only covers a name without the form's id suffix: a tampered name with
  the suffix reaches the handler, and the part was silently dropped.)

## Constraint

SvelteKit's `form(schema, handler)` takes one schema, at module scope, for every request, while the
modules are per tenant. On the client, `form.preflight(schema)` validates the submission before it
is sent, with any Standard Schema, also at module scope (or once per component). Neither can depend
on the request. What can: the handler (it runs per request, and can `invalid()`), and the generated
registries, which know every module at build time.

## Design

1. **A form slot is its own kind**, `defineFormSlot<Props>("orders.form")` in
   `#lib/extensions/define.ts`. A module contributing to it adds, besides its components at
   `slots/orders.form/<name>.svelte`, the schema of its part: the default export of
   `src/modules/<id>/form-parts/<point id>.ts`, a valibot object schema, isomorphic. Both halves are
   required (the generator refuses a component without its part's schema and the other way round),
   like a list's columns and their SQL.

2. **The generator brings the parts together** in `src/lib/extensions/form-parts.gen.ts`: by form
   slot id, each contributing module's schema under its id, imported statically (every form slot
   has an entry, `{}` without parts). Core's `formPartsSchema("orders.form")`
   (`#lib/extensions/form-parts.ts`) makes the form's `modules` field from it:
   `v.optional(v.object({ materials: v.optional(materialsPart), … }), {})`. Static, and exactly
   typed per module, so core's form types (`RemoteFormFields`, `invalid`'s issues, the handler's
   input) stay exact and know `modules.materials.lines[0].quantity`. Every tenant's bundle carries
   every module's part schema, as it carries every manifest; they're small.

3. **The type check holds a component to its schema.** `contributions.gen.ts` lists a component at a
   form slot with `formSlotContribution<typeof ordersForm, typeof materialsOrdersFormPart>(…)`
   (the schema imported as a type only), which requires the component to take the slot's props plus
   `fields: FormPartFields<typeof part>`. The module's component declares that type from its own
   schema, without a cast. `<ExtensionSlot>` takes the form's `modules` fields for a form slot and
   gives each contribution its module's (`fields.<module id>`).

4. **The browser validates the parts.** The order form preflights `{ modules: formPartsSchema(…) }`,
   so a bad quantity shows on its line without a request, with the message the server would give.
   Only the parts: core's own fields keep being validated by the server on submit, as now
   (preflighting them too would change what core's tests and forms do; it's a separate change).
   Parts are optional, so the preflight needs no list of the tenant's modules: a part that isn't
   rendered isn't submitted, and an absent part passes.

5. **The server validates the parts** twice over: SvelteKit's form validation runs the same
   schema on every submission (a part that isn't valid never reaches the handler, and its issues
   land on its fields); and the handler refuses a part of a module the tenant doesn't have
   (`refuseOffParts()`, `#lib/server/forms.ts`), with a message on the form, before anything is
   saved. Whether an enabled module's part is required is the module's call, in its save hook:
   materials accepts an absent part (an order without lines renders no inputs) as no lines.

6. **The save hook gets the part parsed and typed**: `OrderSaving.form` is
   `FormPartsOutput<"orders.form">`, so the materials module reads `form.materials?.lines` as
   `{ materialId: number; quantity: number }[]`; it no longer parses the part itself.

7. **The error path** shrinks: schema problems never reach the save hook (the form's validation
   handles them, in the browser and on the server). What the save hook still refuses needs the
   database (an unknown material, whole pieces, a stock shortage); its `OrderProblem` is a Standard
   Schema issue (`{ message, path? }`, the path from the form's root), so core passes
   `OrderRefused`'s problems to `invalid()` as they are, without reshaping them. `OrderStockShortage`
   stays inside the module, since the portal uses it too.

## Alternatives rejected

- **A per-tenant schema in `preflight()` only, with the server's schema left loose.** The browser
  would validate, but the server's types and validation would stay as loose as now, and the module
  would still parse its part in the save hook. Preflight is a convenience; the server's schema is
  what holds.
- **A loose server schema plus per-module validation in the save hook** (today's design, typed
  better). Keeps the issues server-only and after core's checks, and the cast in the component.
- **A hidden field saying which modules are on, making their parts required.** A hidden field is the
  client's claim; the server knows the tenant's modules (`currentTenant().modules`) and checks them
  itself. The preflight doesn't need it either: parts are optional, and a module that wants its
  part required says so in its save hook (on the server, where it counts). Should a module ever
  need a required part checked in the browser, the client already loads the tenant's modules
  (`getTenantModules`) and could compose the preflight from them; that would never replace the
  server's check.
- **Lazily imported part schemas in `contributions.gen.ts`** (for the type check). The same schema
  imported both statically (by the form's schema) and dynamically makes Vite warn, and a
  type-only import is enough for the type check.

## Not fixed

A field name without the form's id suffix is still SvelteKit's `form_field_unbound`, a 500, before
the app sees the submission: SvelteKit's own check, which the app can't answer differently. A
tampered part with a proper name is now refused by the app, with a message on the form (a remote
form's refusal is an issue, answered with HTTP 200, not a 400 status).
