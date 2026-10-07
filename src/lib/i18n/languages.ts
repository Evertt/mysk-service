import { type Locale, setLocale } from "#lib/paraglide/runtime.js";

/** Each language by its own name, so people recognise theirs whatever language the page is in. */
export const languageNames: Record<Locale, string> = { en: "English", nl: "Nederlands" };

/**
 * Switches the app to another language: Paraglide remembers it in a cookie (`PARAGLIDE_LOCALE`,
 * which the server reads for every request) and reloads the page, so everything, including what
 * the server rendered, is in the new language.
 */
export const switchLanguage = (locale: Locale) => setLocale(locale);
