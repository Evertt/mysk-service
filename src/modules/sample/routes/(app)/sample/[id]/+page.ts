import type { RouteParams } from "$app/types";
import { error, type LoadEvent } from "@sveltejs/kit";

// A page option: Kit must see it without loading this file (the URL gets a trailing slash).
export const trailingSlash = "always";

export const load = ({ params }: LoadEvent<RouteParams<"/(app)/sample/[id]">>) => {
	if (params.id === "boom") error(418, "Boom");
	return { id: params.id };
};
