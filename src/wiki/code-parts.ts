/** `text` in parts, those between backticks marked as code (a message's code, `inline-code.svelte`). */
export function codeParts(text: string): { text: string; code: boolean }[] {
	return text
		.split("`")
		.map((part, index) => ({ text: part, code: index % 2 === 1 }))
		.filter((part) => part.text);
}
