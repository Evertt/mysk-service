/** The shapes of office pages a skeleton can take (see `page-skeleton.svelte`). */
export type PageShape = "dashboard" | "list" | "detail" | "form" | "cards";

/** Pages whose shape their route doesn't tell. */
const shapes: Record<string, PageShape> = {
	"/(app)/(dashboard)": "dashboard",
	"/(app)/settings": "cards",
	"/(app)/(modules)/invoices/settings": "form",
};

/**
 * The shape of the office page a route shows, for the skeleton shown while it loads: a page of
 * its own (`/orders/new`, `/orders/[number]/edit`) is a form, one of a record (`/orders/[number]`)
 * its details, any other a list. So a module's pages get theirs without telling core.
 */
export function pageShape(routeId: string | null): PageShape {
	if (routeId === null) return "detail";
	const shape = shapes[routeId];
	if (shape) return shape;
	if (/\/(new|edit)$/.test(routeId)) return "form";
	if (routeId.endsWith("]")) return "detail";
	return "list";
}
