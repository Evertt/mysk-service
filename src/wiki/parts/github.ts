/** Where the wiki's links to the source point: the repository, at the commit the wiki was built from. */
const repository = "https://github.com/Evertt/mysk-service/blob";

/** The URL of `path` (from the project root) on GitHub at this build's commit, to an `anchor`. */
export function githubUrl(path: string, anchor?: string) {
	return `${repository}/${__WIKI_COMMIT__}/${path}${anchor ? `#${anchor}` : ""}`;
}

/** GitHub's anchor for a heading: lower case, punctuation dropped, spaces as hyphens. */
export function headingSlug(heading: string) {
	return heading
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s_-]/gu, "")
		.replace(/\s/g, "-");
}
