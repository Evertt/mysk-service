/** Used to estimate labour cost while no engineer is assigned yet. In cents. */
export const STANDARD_HOURLY_RATE = 8500;

/** Labour cost in cents, at the engineer's rate or the standard rate when unassigned. */
export const laborCost = (hours: number, hourlyRate: number | null | undefined) =>
	Math.round(hours * (hourlyRate ?? STANDARD_HOURLY_RATE));
