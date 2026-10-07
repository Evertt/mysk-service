import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { sendMail } from "./mail.ts";

const env = vi.hoisted(() => ({
	MAIL_FROM: "Fieldworks <noreply@fieldworks.example>",
	MAIL_OUTBOX: undefined as string | undefined,
	SMTP_URL: undefined as string | undefined,
}));
vi.mock("$app/env/private", () => ({
	get MAIL_FROM() {
		return env.MAIL_FROM;
	},
	get MAIL_OUTBOX() {
		return env.MAIL_OUTBOX;
	},
	get SMTP_URL() {
		return env.SMTP_URL;
	},
}));

const smtp = vi.hoisted(() => ({ createTransport: vi.fn(), sendMail: vi.fn() }));
vi.mock("nodemailer", () => ({
	createTransport: smtp.createTransport.mockImplementation(() => ({ sendMail: smtp.sendMail })),
}));

const mail = { to: "new@example.com", subject: "Hello", text: "Open https://example.com/x" };
let folder: string;

beforeEach(() => {
	folder = mkdtempSync(join(tmpdir(), "mail-spec-"));
	env.MAIL_OUTBOX = undefined;
	env.SMTP_URL = undefined;
	smtp.sendMail.mockClear();
});

afterEach(() => {
	rmSync(folder, { recursive: true, force: true });
});

test("without SMTP_URL, mail is logged instead of sent", async () => {
	const log = vi.spyOn(console, "info").mockImplementation(() => {});
	await sendMail(mail);
	expect(log).toHaveBeenCalledOnce();
	expect(log.mock.calls[0][0]).toContain("To: new@example.com");
	expect(log.mock.calls[0][0]).toContain("https://example.com/x");
	expect(smtp.sendMail).not.toHaveBeenCalled();
	log.mockRestore();
});

test("with SMTP_URL, mail goes through SMTP", async () => {
	env.SMTP_URL = "smtp://localhost:2525";
	await sendMail(mail);
	expect(smtp.createTransport).toHaveBeenCalledWith("smtp://localhost:2525");
	expect(smtp.sendMail).toHaveBeenCalledWith({ from: env.MAIL_FROM, ...mail });
});

test("with MAIL_OUTBOX, mail is appended to that file, even if SMTP_URL is set", async () => {
	env.MAIL_OUTBOX = join(folder, "outbox.jsonl");
	env.SMTP_URL = "smtp://localhost:2525";
	await sendMail(mail);
	await sendMail({ ...mail, subject: "Again" });
	const lines = readFileSync(env.MAIL_OUTBOX, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	expect(lines).toMatchObject([
		{ ...mail, from: env.MAIL_FROM },
		{ ...mail, subject: "Again" },
	]);
	expect(smtp.sendMail).not.toHaveBeenCalled();
});
