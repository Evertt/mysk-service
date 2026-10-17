/**
 * The site page's clock: `now` is the current moment, and reading it in a template, `$derived` or
 * effect makes it run again every 15 seconds while something reads it (an open door's minutes count
 * up between the feed's batches).
 */
import { createSubscriber } from "svelte/reactivity";

export class Clock {
	#subscribe = createSubscriber((update) => {
		const timer = setInterval(update, 15_000);
		return () => clearInterval(timer);
	});

	get now() {
		this.#subscribe();
		return Temporal.Now.instant();
	}
}
