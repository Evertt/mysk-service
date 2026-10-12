/**
 * What the saved views' remote functions (`views.remote.ts`) and the tables' memory
 * (`table-memory.remote.ts`) check their arguments with.
 */
import * as v from "valibot";

import { columnVisibilityMax } from "./column-visibility.ts";
import { viewQueryMax } from "./views.ts";

/** Which table: `/(app)/orders` (see `tableViewsKey`). */
export const tableKeySchema = v.pipe(v.string(), v.nonEmpty(), v.maxLength(200));

/** A table's parameters as its URL has them: `""` or `?…`. */
export const viewQuerySchema = v.pipe(
	v.string(),
	v.maxLength(viewQueryMax),
	v.check((value) => value === "" || value.startsWith("?")),
);

/** Which of a table's hideable columns are shown, by id (see `column-visibility.ts`). */
export const columnVisibilitySchema = v.pipe(
	v.record(v.pipe(v.string(), v.nonEmpty(), v.maxLength(100)), v.boolean()),
	v.check((value) => Object.keys(value).length <= columnVisibilityMax),
);
