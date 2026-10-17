/**
 * The invoicing module's tables that the modules requiring it may refer to with a foreign key (the
 * partner programme's bonus year, to the credit note it's paid out with). To read them; changes go
 * through the services next to this file (`credit-notes.server.ts`). Server-only.
 */
export { creditNote } from "../server/schema.ts";
