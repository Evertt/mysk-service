/**
 * The rows of a form that can be added and removed (an order's materials, a year's levels):
 *
 * ```svelte
 * const lines = lineItems(() => saved.map(({ materialId, quantity }) => ({ materialId, quantity })));
 *
 * {#each lines.rows as line, index (line.key)}
 * 	<input {...withoutValue(form.fields.lines[index].quantity.as("number"))} bind:value={line.quantity} />
 * 	<Button onclick={() => lines.remove(index)}>…</Button>
 * {/each}
 * <Button onclick={() => lines.add({ materialId: "", quantity: 1 })}>…</Button>
 * ```
 *
 * Each row has a `key` of its own, so removing one keeps the inputs of those after it. The inputs'
 * names (from the form's field at the row's index) make the rows part of the submission; their
 * values come from the row, as removing a row shifts the indexes, so `withoutValue()` takes only
 * the name and validation attributes from the field.
 */

type LineItem<T> = T & { key: string };

const keyed = <T extends object>(row: T): LineItem<T> => ({ ...row, key: crypto.randomUUID() });

class LineItems<T extends object> {
	rows = $state<LineItem<T>[]>([]);

	/** `initial` gives the rows to start with, read once. */
	constructor(initial: () => T[]) {
		this.rows = initial().map(keyed);
	}

	add(row: T) {
		this.rows.push(keyed(row));
	}

	remove(index: number) {
		this.rows.splice(index, 1);
	}
}

/** A form's rows that can be added and removed; see above. */
export const lineItems = <T extends object>(initial: () => T[]) => new LineItems(initial);

/** A form field's attributes without its value, which the row gives instead (see above). */
export function withoutValue<T extends { value?: unknown }>({ value: _value, ...attributes }: T) {
	return attributes;
}
