// Claude Code "Stop" hook: tells the Stream Deck plugin that a session finished.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.env.LOCALAPPDATA ?? process.env.HOME ?? ".", "sendeskill-devdeck");
const file = path.join(dir, "claude-done.json");

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
	let payload = {};
	try {
		payload = JSON.parse(input);
	} catch {
		// Still signal; fall back to the hook's working directory.
	}
	try {
		fs.mkdirSync(dir, { recursive: true });
		const tmp = file + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify({ cwd: payload.cwd ?? process.cwd(), at: new Date().toISOString() }));
		fs.renameSync(tmp, file);
	} catch {
		// Never block Claude Code on a notification failure.
	}
	process.exit(0);
});
