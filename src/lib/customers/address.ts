/**
 * A site's address on one line, as a card's subtitle or a printed work order has it: the street,
 * then the postal code and city, those it has (`Industrieweg 12, 6716 BM Ede`).
 */
export const siteAddressLine = (site: { address: string; postalCode: string; city: string }) =>
	[site.address, [site.postalCode, site.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
