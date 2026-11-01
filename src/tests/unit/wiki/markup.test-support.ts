/**
 * Reading the wiki's markup as text, for its guards: the link guard (`links.spec.ts`) and the twins
 * guard (`twins.spec.ts`). Tags may span lines; attributes may be quoted either way or a literal in
 * braces (`{'…'}`).
 */

/** A reference in a file: where it starts and what it points at (`null`: it can't be read). */
export interface Reference {
	index: number;
	target: string | null;
}

/** An opening tag, whole: quoted values and `{…}` expressions may hold a `>`. */
const openingTag = /<[A-Za-z][\w.]*(?:[^>"'{]|"[^"]*"|'[^']*'|\{[^}]*\})*>/y;

/** The whole opening tag that starts at `index` of `source`, over lines; `undefined` if unclosed. */
export function tagAt(source: string, index: number): string | undefined {
	openingTag.lastIndex = index;
	return openingTag.exec(source)?.[0];
}

/** The value of the attribute `name` in `tag`, if it's a string literal in quotes or in braces. */
export function attribute(tag: string, name: string): string | null {
	const match = new RegExp(
		`(?<![\\w-])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*(?:"([^"]*)"|'([^']*)'|\`([^\`]*)\`)\\s*\\})`,
	).exec(tag);
	const value = match?.slice(1).find((group) => group !== undefined);
	return value === undefined || value === "" || value.includes("${") ? null : value;
}

/** Whether `tag` has the attribute `name`, whatever its value. */
export const hasAttribute = (tag: string, name: string) =>
	new RegExp(`(?<![\\w-])${name}\\s*=`).test(tag);

/** The `line` of a tag (`line={28}`, `line="28"`), `null` where it isn't a number literal. */
export function lineAttribute(tag: string): number | null {
	const line = /(?<![\w-])line\s*=\s*(?:\{\s*(\d+)\s*\}|"(\d+)"|'(\d+)')/.exec(tag);
	return line ? Number(line[1] ?? line[2] ?? line[3]) : null;
}

/** Every `<tag …>` of `source` with its `name` attribute: whole tags, over lines. */
export function tagReferences(tag: string, name: string) {
	return (source: string): Reference[] =>
		[...source.matchAll(new RegExp(`<${tag}(?![\\w.-])`, "g"))].map((match) => {
			const whole = tagAt(source, match.index);
			return { index: match.index, target: whole ? attribute(whole, name) : null };
		});
}

/** The links to `/wiki` in markup (`href`), Markdown (`](…)`) and reference-style Markdown. */
export function wikiLinks(source: string): Reference[] {
	const wiki = "\\/wiki(?:[/?#][^\"'`)>\\s]*)?";
	const found = new Map<number, Reference>();
	const add = (pattern: RegExp) => {
		for (const match of source.matchAll(pattern)) {
			const target = match[2] ?? "";
			found.set(match.index, { index: match.index, target: target.includes("${") ? null : target });
		}
	};
	add(new RegExp(`href\\s*=\\s*(["'])(${wiki})\\1`, "g"));
	add(new RegExp(`href\\s*=\\s*\\{\\s*(["'\`])(${wiki})\\1\\s*\\}`, "g"));
	add(new RegExp(`(\\])\\(\\s*<?(${wiki})`, "g"));
	add(new RegExp(`^( {0,3}\\[[^\\]]+\\]:)[ \\t]*<?(${wiki})`, "gm"));
	// An `href` expression with /wiki in it that none of the above could read.
	for (const match of source.matchAll(/href\s*=\s*\{[^}]*\/wiki[^}]*\}/g)) {
		if (!found.has(match.index)) found.set(match.index, { index: match.index, target: null });
	}
	return [...found.values()].sort((a, b) => a.index - b.index);
}

/** `/wiki/orders/lifecycle#x?y` is the slug `orders/lifecycle`; `/wiki` itself is `""`. */
export const slugOf = (href: string) =>
	href
		.replace(/^\/wiki\/?/, "")
		.replace(/[?#].*$/, "")
		.replace(/\/$/, "");
