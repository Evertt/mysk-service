const currency = new Intl.NumberFormat("en-NL", { style: "currency", currency: "EUR" });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Formats an amount in cents, e.g. `123456` → `€1,234.56`. */
export const formatCents = (cents: number) => currency.format(cents / 100);

export const formatDate = (value: Date) => date.format(value);
