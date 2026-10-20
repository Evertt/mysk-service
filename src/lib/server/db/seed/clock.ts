/** When the seed ran: the data is generated relative to it, so there's always work in progress. */
export const now = new Date();

/** The start of the day the seed ran, at local midnight. */
export const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
