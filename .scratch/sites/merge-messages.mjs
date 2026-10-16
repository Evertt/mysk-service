// Adds the messages in a JSON file ({ en: { section: { key: value } }, nl: … }) to messages/.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [file, root] = process.argv.slice(2);
const add = JSON.parse(readFileSync(file, "utf8"));
for (const [locale, sections] of Object.entries(add)) {
	for (const [section, entries] of Object.entries(sections)) {
		const path = join(root, "messages", locale, `${section}.json`);
		const messages = JSON.parse(readFileSync(path, "utf8"));
		for (const [key, value] of Object.entries(entries)) messages[key] = value;
		writeFileSync(path, JSON.stringify(messages, null, "\t") + "\n");
	}
}
