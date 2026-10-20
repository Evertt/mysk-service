/**
 * Whether `value` is one of `values`, and so of their type: `isOneOf(openOrderStatuses, status)`,
 * `isOneOf(periods, url.searchParams.get("period"))`. Use it rather than casting the list
 * (`(xs as readonly string[]).includes(x)`); `src/tests/unit/is-one-of.spec.ts` refuses the cast.
 */
export const isOneOf = <const T>(values: readonly T[], value: unknown): value is T =>
	values.includes(value as T);
