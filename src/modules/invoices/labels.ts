/**
 * The translated names of the invoices module's enum values: the map generated from its arrays tagged
 * `@labels` (`labels.gen.ts`), see `#lib/i18n/labels.ts`.
 */
import { defineLabels } from "#lib/i18n/index.ts";

import { labels } from "./labels.gen.ts";

export const invoicesLabels = defineLabels(labels);
