import { isHttpError } from "@sveltejs/kit";

export { cn } from "cn";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

/** What to tell the user about a failed call: the message of a thrown `error(status, message)`, else `fallback`. */
export function errorMessage(error: unknown, fallback: string) {
	return isHttpError(error) ? error.body.message : fallback;
}
