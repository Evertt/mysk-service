/**
 * The bug reports' settings, from the environment (`src/env.ts`): read here only, so a spec can
 * replace them with `vi.mock()` of this file (mocking `$app/env/private` would replace the test
 * database's URL too).
 */
import { BUG_REPORT_EMAIL, BUG_REPORTS_DIR, DEVELOPER_EMAILS } from "$app/env/private";

export const bugReportSettings = {
	/** Who's mailed about each report; unset, the mail is logged instead. */
	email: BUG_REPORT_EMAIL,
	/** The folder the recordings go to off Cloudflare. */
	folder: BUG_REPORTS_DIR,
	/** The developers' email addresses, lower case: only they may open the reports. */
	developers: DEVELOPER_EMAILS,
};
