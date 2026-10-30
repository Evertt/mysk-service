/**
 * How a change reaches the pages that show it, for `<LiveFlow>`: the steps from a change in the
 * database to a page that refreshes, each with the file that does it (`docs/agents/kit.md`,
 * "Staying live"). Code in a step's text is between backticks.
 */
export const liveSteps: readonly {
	id: "change" | "log" | "feed" | "refresh";
	title: string;
	detail: string;
	/** The file that does it, from the project root. */
	source: string;
}[] = [
	{
		id: "change",
		title: "A record changes",
		detail:
			"A form or a command changes a record in a `db.transaction`: a planner plans an order, say, through `transitionOrder()`.",
		source: "src/lib/orders/server/lifecycle.ts",
	},
	{
		id: "log",
		title: "recordActivity() logs it",
		detail:
			"In the same transaction, `recordActivity(tx, { action, subject, before, after })` writes the activity entry. Once the transaction commits, it announces the change; one rolled back logs and announces nothing.",
		source: "src/lib/server/activity/log.ts",
	},
	{
		id: "feed",
		title: "The shell's feed tells the tab",
		detail:
			"Each shell keeps one live query open per tab (the office's `watchTenantChanges`, built on `liveFeed(types, feedFor())`). It hears the announcement, keeps the changes to records the viewer may read, and sends them down its stream.",
		source: "src/lib/server/live.ts",
	},
	{
		id: "refresh",
		title: "The page refreshes",
		detail:
			"`provideChangeFeed()` in the shell's layout hands each change to the components that follow its record: `refreshOnRecordChange()` refreshes their query, and the page shows the new data. There is no live query per record.",
		source: "src/lib/components/activity/change-feed.svelte.ts",
	},
];

/** `text` in parts, those between backticks marked as code. */
export function codeParts(text: string): { text: string; code: boolean }[] {
	return text
		.split("`")
		.map((part, index) => ({ text: part, code: index % 2 === 1 }))
		.filter((part) => part.text);
}
