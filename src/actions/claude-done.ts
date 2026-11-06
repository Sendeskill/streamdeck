import streamDeck, { action, SingletonAction, type KeyAction, type WillAppearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fit, svgKey } from "../render";
import { SIGNAL_DIR, SIGNAL_FILE, type DoneSignal } from "../signal";

const VSCODE_EXE = path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe");

@action({ UUID: "com.sendeskill.devdeck.claude-done" })
export class ClaudeDone extends SingletonAction {
	private pending?: DoneSignal;
	private lastCwd?: string;
	private watcher?: fs.FSWatcher;
	private timer?: NodeJS.Timeout;
	private lastImage = new Map<string, string>();

	override async onWillAppear(_ev: WillAppearEvent): Promise<void> {
		this.startWatching();
		this.timer ??= setInterval(() => void this.render(), 500);
		await this.render();
	}

	override onWillDisappear(): void {
		if ([...this.actions].length === 0) {
			this.watcher?.close();
			this.watcher = undefined;
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	override async onKeyDown(): Promise<void> {
		const cwd = this.pending?.cwd ?? this.lastCwd;
		this.pending = undefined;
		fs.rmSync(SIGNAL_FILE, { force: true });
		openVsCode(cwd);
		await this.render();
	}

	private startWatching(): void {
		if (this.watcher) return;
		fs.mkdirSync(SIGNAL_DIR, { recursive: true });
		this.readSignal();
		this.watcher = fs.watch(SIGNAL_DIR, (_type, file) => {
			if (file === path.basename(SIGNAL_FILE)) this.readSignal();
		});
	}

	private readSignal(): void {
		try {
			const signal = JSON.parse(fs.readFileSync(SIGNAL_FILE, "utf8")) as DoneSignal;
			this.pending = signal;
			this.lastCwd = signal.cwd;
		} catch {
			// Missing (acknowledged) or mid-write; the next watch event re-reads it.
		}
	}

	private async render(): Promise<void> {
		const image = this.face();
		for (const a of this.actions) {
			if (a.isKey() && this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await (a as KeyAction<JsonObject>).setImage(image);
			}
		}
	}

	private face(): string {
		if (!this.pending) {
			return svgKey({
				background: "#1f1f1f",
				lines: [
					{ text: "Claude", size: 22, bold: true, color: "#d97757" },
					{ text: "aguardando", size: 16, color: "#aaa" },
				],
			});
		}
		const on = Math.floor(Date.now() / 500) % 2 === 0;
		return svgKey({
			background: on ? "#d97757" : "#3a1f14",
			lines: [
				{ text: "Claude", size: 22, bold: true },
				{ text: "terminou!", size: 20 },
				{ text: fit(path.basename(this.pending.cwd), 14), size: 15, color: "#ffe" },
			],
		});
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
