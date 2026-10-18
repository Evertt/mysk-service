import {
	type App,
	BROWSER_OPTIONS,
	baseURL,
	homeOf,
	hydrated,
	quiet,
	signInContext,
} from "./app.ts";

/**
 * A page in a browser context of its own, signed in as `email`, with the URLs of the remote
 * functions it called on the way. Close its context when done.
 *
 * Signed in without the form (`signInContext`), but on the way the login form takes: from the
 * login page to their home in the app, client-side, so the home's queries are remote function
 * calls (a page the server renders answers them itself).
 */
export async function signedInPage(app: App, email: string) {
	const browser = app.page.context().browser()!;
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		...BROWSER_OPTIONS,
	});
	const page = await context.newPage();
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/_app/remote")) requests.push(request.url());
	});
	const [home] = await Promise.all([
		homeOf(email),
		page.goto(`${baseURL}/login`).then(() => hydrated(page)),
	]);
	await signInContext(context, email);
	// A link the app's router follows, as it follows the form's redirect. The router starts
	// listening only after the page is hydrated (SvelteKit's `start()`): until it takes the click
	// (it prevents the browser's own navigation), the click is called off and tried again.
	const followed = await page.evaluate(async (href) => {
		for (let attempt = 0; attempt < 100; attempt++) {
			const link = document.createElement("a");
			link.href = href;
			document.body.append(link);
			let routed = false;
			const check = (event: MouseEvent) => {
				routed = event.defaultPrevented;
				if (!routed) event.preventDefault();
			};
			window.addEventListener("click", check, { once: true });
			link.click();
			link.remove();
			if (routed) return true;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		return false;
	}, home);
	if (!followed) throw new Error(`The app's router didn't follow a link to ${home}.`);
	await page.waitForURL((url) => url.pathname === home);
	await quiet(page);
	return { page, requests };
}
