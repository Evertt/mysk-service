import type { ReportContext } from "./report.ts";

/**
 * A report's context as lines of a label and a value, for its mail and its replay page: the page,
 * the version, who reported it (`user`) where, and their browser.
 */
export function contextLines(user: string, context: ReportContext): [string, string][] {
	const { viewport } = context;
	const none = m.bugs_none();
	return [
		[m.bugs_context_page(), context.url],
		[m.bugs_context_route(), context.routeId ?? none],
		[m.bugs_context_version(), context.version],
		[m.bugs_context_user(), user],
		[m.bugs_context_organization(), `${context.organization.name} (${context.organization.slug})`],
		[m.bugs_context_roles(), context.roles.join(", ") || none],
		[m.bugs_context_modules(), context.modules.join(", ") || none],
		[
			m.bugs_context_screen(),
			m.bugs_context_screen_value({
				width: String(viewport.width),
				height: String(viewport.height),
				ratio: String(viewport.pixelRatio),
			}),
		],
		[m.bugs_context_browser(), context.userAgent],
		[m.bugs_context_language(), [context.locale, ...context.languages].join(", ")],
		[m.bugs_context_time_zone(), context.timeZone],
		[
			m.bugs_context_theme(),
			// The values as `<html>` had them (`data-theme`, `data-mode`, `data-table-density`).
			[
				context.theme,
				context.mode === "system" ? `system (${context.dark ? "dark" : "light"})` : context.mode,
				context.density,
			].join(", "),
		],
		[m.bugs_context_online(), context.online ? m.bugs_yes() : m.bugs_no()],
	];
}
