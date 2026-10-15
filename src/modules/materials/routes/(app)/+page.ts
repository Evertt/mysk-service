import type { Load } from "@sveltejs/kit";

import { loadTableMemory } from "#lib/components/data-table/table-memory.svelte.ts";

// The table as the member left it (see `table-memory.svelte.ts`).
export const load: Load = loadTableMemory;
