import { expect, test } from "vite-plus/test";

import { messageParts } from "./parts.ts";

test("splits a message around its slots, wherever the language puts them", () => {
	const english = (v: { user: string; subject: string }) => `${v.user} updated ${v.subject}`;
	const dutch = (v: { user: string; subject: string }) => `${v.user} heeft ${v.subject} bijgewerkt`;
	expect(messageParts((slot) => english({ user: slot("user"), subject: slot("subject") }))).toEqual(
		[{ slot: "user" }, { text: " updated " }, { slot: "subject" }],
	);
	expect(messageParts((slot) => dutch({ user: slot("user"), subject: slot("subject") }))).toEqual([
		{ slot: "user" },
		{ text: " heeft " },
		{ slot: "subject" },
		{ text: " bijgewerkt" },
	]);
});

test("keeps a message without slots whole", () => {
	expect(messageParts(() => "Nothing yet")).toEqual([{ text: "Nothing yet" }]);
});
