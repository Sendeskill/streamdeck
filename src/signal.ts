import path from "node:path";

export const SIGNAL_DIR = path.join(process.env.LOCALAPPDATA ?? process.env.HOME ?? ".", "sendeskill-devdeck");
export const STATE_FILE = path.join(SIGNAL_DIR, "claude-state.json");

export type ClaudeState = { state: "running" | "done" | "idle"; cwd: string; at: string };
