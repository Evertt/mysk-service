/**
 * How a change reaches the pages that show it, for `<LiveFlow>`: the steps from a change in the
 * database to a page that refreshes, each with the file that does it (`docs/agents/kit.md`,
 * "Staying live"). A step's title and detail are message functions, read where they're shown; code
 * in a detail is between backticks (`<InlineCode>`).
 */
import { m } from "#lib/paraglide/messages.js";

export const liveSteps: readonly {
	id: "change" | "log" | "feed" | "refresh";
	title: () => string;
	detail: () => string;
	/** The step's name in the drawing. */
	box: () => string;
	/** The file that does it, from the project root. */
	source: string;
}[] = [
	{
		id: "change",
		title: m.wiki_live_change_title,
		detail: m.wiki_live_change_detail,
		box: m.wiki_live_box_change,
		source: "src/lib/orders/server/lifecycle.ts",
	},
	{
		id: "log",
		title: m.wiki_live_log_title,
		detail: m.wiki_live_log_detail,
		box: m.wiki_live_box_log,
		source: "src/lib/server/activity/log.ts",
	},
	{
		id: "feed",
		title: m.wiki_live_feed_title,
		detail: m.wiki_live_feed_detail,
		box: m.wiki_live_box_feed,
		source: "src/lib/server/live.ts",
	},
	{
		id: "refresh",
		title: m.wiki_live_refresh_title,
		detail: m.wiki_live_refresh_detail,
		box: m.wiki_live_box_refresh,
		source: "src/lib/components/activity/change-feed.svelte.ts",
	},
];
