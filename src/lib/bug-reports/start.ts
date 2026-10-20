/**
 * Starts a recording of this page, as the record button and the engineer portal's menu item
 * ("Report a problem") do, and says so in a toast.
 */
import { version } from "$app/env";
import { page } from "$app/state";
import { toast } from "svelte-sonner";

import { ran } from "#lib/components/form/submitted.ts";
import { getTimeZone } from "#lib/dates.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";

import { collectContext } from "./context.ts";
import { bugRecorder } from "./recorder.svelte.ts";

export async function startBugReport() {
	const context = collectContext(
		{ url: page.url.href, routeId: page.route.id },
		{ version, locale: getLocale(), timeZone: getTimeZone() },
	);
	if (await ran(() => bugRecorder().start(context), m.bugs_recording_failed())) {
		toast.info(m.bugs_recording_started());
	}
}
