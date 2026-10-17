/**
 * The board's clock: `now` is the current moment, and reading it in a template, `$derived` or
 * effect makes it run again every second, while something reads it (the door timers count up).
 */
import { createSubscriber } from "svelte/reactivity";

export class Clock {
	#subscribe = createSubscriber((update) => {
		const timer = setInterval(update, 1000);
		return () => clearInterval(timer);
	});

	get now() {
		this.#subscribe();
		return Temporal.Now.instant();
	}
}
