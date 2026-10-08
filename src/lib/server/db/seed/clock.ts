/** When the seed ran: the data is generated relative to it, so there's always work in progress. */
export const now = new Date();

export const DAY = 24 * 60 * 60 * 1000;

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
