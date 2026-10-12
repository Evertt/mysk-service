/**
 * A stand-in for `table-memory.remote.ts` in component tests of tables, where remote functions
 * can't run: nothing is remembered, and what the table would remember is recorded in `remembered`.
 *
 * ```ts
 * vi.mock("#lib/components/data-table/table-memory.remote.ts", () => import("./fake-table-memory.ts"));
 * ```
 */
import type {
	TableMemory,
	TableMemoryAnswer,
} from "#lib/components/data-table/table-memory.remote.ts";

export type { TableMemory, TableMemoryAnswer };

/** What the tables asked to remember, oldest first (whose, as the page passed it: `org:user`). */
export const remembered: ({ owner: string; tableKey: string } & TableMemory)[] = [];

export const getTableMemory = async (_key: string): Promise<TableMemoryAnswer> => ({
	owner: "org:user",
	memory: null,
});

export const rememberTable = async (memory: { owner: string; tableKey: string } & TableMemory) => {
	remembered.push(memory);
};
