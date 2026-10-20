/** `text` to put in a mail's HTML, as text or in an attribute. */
export const escapeHtml = (text: string) =>
	text.replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
	);
