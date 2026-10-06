const currency = new Intl.NumberFormat("en-NL", { style: "currency", currency: "EUR" });
const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Formats an amount in cents, e.g. `123456` → `€1,234.56`. */
export const formatCents = (cents: number) => currency.format(cents / 100);

export const formatDate = (value: Date) => date.format(value);

/** Formats a count or quantity, with at most two decimals, e.g. `2.5` or `1,250`. */
export const formatNumber = (value: number) => number.format(value);

/** Turns an enum value into a label, e.g. `out_of_service` → `Out of service`. */
export const humanize = (value: string) => {
	const text = value.replaceAll("_", " ");
	return text.charAt(0).toUpperCase() + text.slice(1);
};
