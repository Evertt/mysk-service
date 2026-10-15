import type { App } from "#e2e/app.ts";

/** Cents, rounded half away from zero. */
export const round = (cents: number) => Math.sign(cents) * Math.round(Math.abs(cents));
/** The VAT on a subtotal: the rate in percent, rounded once on the sum. */
export const vatOf = (subtotal: number, rate = 21) => round((subtotal * rate) / 100);

/** Today as the database has days, `yyyy-mm-dd` (the machine's, which is the test server's). */
export const today = () => Temporal.Now.plainDateISO().toString();

/** An amount as shown, e.g. `-€1,234.50`, in cents. */
export const cents = (text: string) => Math.round(Number(text.replace(/[^\d.-]/g, "")) * 100);

/** Locators on the app's current page. */
export function pageLocators(app: App) {
	return {
		sidebar: () => app.page.locator('[data-sidebar="content"]').innerText(),
		/** A card on the page, by its title. */
		card: (title: string) =>
			app.page.locator('main [data-slot="card"]', {
				has: app.page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${title}$`) }),
			}),
	};
}
