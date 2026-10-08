/**
 * A translated message with markup in it, e.g. a link: "Invoiced on {invoice}, {date}" with the
 * invoice number as a link. Translations put the variables where their language wants them, so the
 * message is rendered whole and split around the variables that are markup:
 *
 * ```svelte
 * {#each messageParts((slot) => m.x({ invoice: slot("invoice"), date })) as part, i (i)}
 *   {#if "text" in part}{part.text}{:else}<InvoiceLink {number} />{/if}
 * {/each}
 * ```
 */

/** Marks a slot in the rendered message; private-use characters, so no message contains them. */
const [open, close] = ["\u{E000}", "\u{E001}"];
const slots = new RegExp(`${open}(\\w+)${close}`);

export type MessagePart<S extends string> = { text: string } | { slot: S };

/**
 * The parts of a message, in order: its texts and the slots `render` put in it (by name), e.g.
 * `[{ text: "Invoiced on " }, { slot: "invoice" }, { text: ", 7 Oct 2026" }]`. Empty texts are
 * left out.
 */
export function messageParts<S extends string>(
	render: (slot: (name: S) => string) => string,
): MessagePart<S>[] {
	return render((name) => `${open}${name}${close}`)
		.split(slots)
		.flatMap((piece, i): MessagePart<S>[] => {
			if (i % 2) return [{ slot: piece as S }];
			return piece ? [{ text: piece }] : [];
		});
}
