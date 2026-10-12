/**
 * A stand-in for `table-memory.remote.ts` in component tests of tables, where remote functions
 * can't run: nothing is remembered, and what the table would remember is recorded in `remembered`.
 *
 * ```ts
 * vi.mock("#lib/components/data-table/table-memory.remote.ts", () => import("./fake-table-memory.ts"));
 * ```
 */
import type { TableMemory } from "#lib/components/data-table/table-memory.remote.ts";

export type { TableMemory };

/** What the tables asked to remember, oldest first. */
export const remembered: ({ tableKey: string } & TableMemory)[] = [];

export const getTableMemory = async (_key: string): Promise<TableMemory | null> => null;

export const rememberTable = async (memory: { tableKey: string } & TableMemory) => {
	remembered.push(memory);
};
