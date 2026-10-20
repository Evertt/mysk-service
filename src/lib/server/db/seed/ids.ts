/**
 * The seed's ids. They're global, so a tenant's rows of a table follow those of the tenants before:
 * a table's ids are claimed tenant by tenant, in the tenants' order, and a tenant's draft numbers
 * its rows from 1.
 */
export class IdSpace {
	#claimed = new Map<object, number>();

	/**
	 * Claims `count` ids of `table` for the next tenant: what turns its draft's ids (`1…count`) into
	 * the rows' ids.
	 */
	claim(table: object, count: number): (draftId: number) => number {
		const offset = this.#claimed.get(table) ?? 0;
		this.#claimed.set(table, offset + count);
		return (draftId) => draftId + offset;
	}
}
