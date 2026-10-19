import { isHttpError } from "@sveltejs/kit";

export { cn } from "cn";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

/**
 * What to tell the user about a failed call: the message of an `error(status, message)` the app
 * threw, else `fallback`. A server's own failure (5xx: a handler that crashed, which SvelteKit
 * reports as "Internal Error", or a proxy's error page, whose message is its status text, often
 * empty) has no message for the user.
 */
export function errorMessage(error: unknown, fallback: string) {
	return isHttpError(error) && error.status < 500 && error.body.message
		? error.body.message
		: fallback;
}
