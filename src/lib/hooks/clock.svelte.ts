/**
 * A clock: `now` is the current moment, and reading it in a template, `$derived` or effect makes it
 * run again every `intervalMs` while something reads it (timers that count up between a feed's
 * updates). One timer per clock, started by its first reader and stopped after its last.
 */
import { createSubscriber } from "svelte/reactivity";

export class Clock {
	#subscribe;

	constructor(intervalMs: number) {
		this.#subscribe = createSubscriber((update) => {
			const timer = setInterval(update, intervalMs);
			return () => clearInterval(timer);
		});
	}

	get now() {
		this.#subscribe();
		return Temporal.Now.instant();
	}
}
