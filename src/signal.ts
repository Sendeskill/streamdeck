import path from "node:path";

export const SIGNAL_DIR = path.join(process.env.LOCALAPPDATA ?? process.env.HOME ?? ".", "sendeskill-devdeck");
export const SIGNAL_FILE = path.join(SIGNAL_DIR, "claude-done.json");

export type DoneSignal = { cwd: string; at: string };
