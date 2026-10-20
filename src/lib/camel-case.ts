/**
 * A kebab-case or dotted name in camelCase: `partner-programme` → `partnerProgramme`,
 * `orders.detail.side` → `ordersDetailSide`. Plain TypeScript, for the module generator
 * (`scripts/modules/`) too.
 */
export const camelCase = (name: string) =>
	name.replace(/[.-](\w)/g, (_, next: string) => next.toUpperCase());
