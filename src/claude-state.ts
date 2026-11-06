import streamDeck from "@elgato/streamdeck";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SIGNAL_DIR, STATE_FILE, type ClaudeState } from "./signal";

type Listener = (state: ClaudeState) => void;

const VSCODE_EXE = path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe");

/** Watches the state file written by the Claude Code hooks and shares it between actions. */
class ClaudeStateStore {
	current: ClaudeState = { state: "idle", cwd: "", at: "" };
	private listeners = new Set<Listener>();
	private watcher?: fs.FSWatcher;

	subscribe(listener: Listener): () => void {
		if (!this.watcher) this.start();
		this.listeners.add(listener);
		listener(this.current);
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) {
				this.watcher?.close();
				this.watcher = undefined;
			}
		};
	}

	/** The user has seen the result: back to idle and open VS Code on that session's folder. */
	acknowledge(): void {
		this.write({ state: "idle", cwd: this.current.cwd, at: new Date().toISOString() });
		openVsCode(this.current.cwd || undefined);
	}

	private start(): void {
		fs.mkdirSync(SIGNAL_DIR, { recursive: true });
		this.read();
		this.watcher = fs.watch(SIGNAL_DIR, (_type, file) => {
			if (file === path.basename(STATE_FILE)) this.read();
		});
	}

	private read(): void {
		let next: ClaudeState;
		try {
			next = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as ClaudeState;
		} catch {
			// Missing or mid-write; the next watch event re-reads it.
			return;
		}
		if (next.state === this.current.state && next.at === this.current.at) return;
		this.current = next;
		for (const l of this.listeners) l(next);
	}

	private write(state: ClaudeState): void {
		fs.mkdirSync(SIGNAL_DIR, { recursive: true });
		const tmp = STATE_FILE + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify(state));
		fs.renameSync(tmp, STATE_FILE);
		this.read();
	}
}

function openVsCode(cwd: string | undefined): void {
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	const exe = fs.existsSync(VSCODE_EXE) ? VSCODE_EXE : "code";
	try {
		spawn(exe, cwd ? [cwd] : [], { detached: true, stdio: "ignore", env, shell: exe === "code" }).unref();
	} catch (err) {
		streamDeck.logger.error(`Failed to open VS Code: ${err}`);
	}
}

export const claudeState = new ClaudeStateStore();
