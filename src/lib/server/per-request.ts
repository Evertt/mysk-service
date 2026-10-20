import { getRequestEvent } from "$app/server";

/**
 * `find`, run once per request: later calls in the same request get its first answer (a promise
 * too, so a remote function's gate and its handler share one lookup).
 */
export function perRequest<T>(find: () => T): () => T {
	const answers = new WeakMap<object, T>();
	return () => {
		const event = getRequestEvent();
		if (!answers.has(event)) answers.set(event, find());
		return answers.get(event)!;
	};
}
