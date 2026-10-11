import { afterEach, expect, test } from "vite-plus/test";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { invitationMail } from "#lib/server/mail/invitation.ts";

const invitation = {
	to: "new@example.com",
	organization: "Fieldworks North",
	inviter: "Avery Admin",
	role: "admin",
	url: "https://app.example/invite/abc123",
	expiresAt: new Date("2026-10-14T09:30:00Z"),
};

test("says who invites whom where, with the link and until when it works", () => {
	const mail = invitationMail(invitation);
	expect(mail.to).toBe("new@example.com");
	expect(mail.subject).toBe("Avery Admin invited you to Fieldworks North on Fieldworks");
	expect(mail.text).toContain("as an admin");
	expect(mail.text).toContain("https://app.example/invite/abc123");
	expect(mail.text).toContain("14 October 2026 at 09:30 (UTC)");
	expect(mail.html).toContain('<a href="https://app.example/invite/abc123">');
});

test("escapes names in the HTML", () => {
	const mail = invitationMail({ ...invitation, inviter: "<b>Eve</b>", role: "member" });
	expect(mail.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
	expect(mail.html).not.toContain("<b>Eve</b>");
	expect(mail.text).toContain("as a member");
});

const englishByDefault = getLocale;
afterEach(() => overwriteGetLocale(englishByDefault));

test("is in the language of whoever invites", () => {
	overwriteGetLocale(() => "nl");
	const mail = invitationMail({ ...invitation, role: "engineer" });
	expect(mail.subject).toBe("Avery Admin heeft je uitgenodigd voor Fieldworks North op Fieldworks");
	expect(mail.text).toContain("op Fieldworks, als monteur.");
	expect(mail.html).toContain("<strong>Fieldworks North</strong>");
	expect(mail.html).toContain(">Uitnodiging accepteren</a>");
});
