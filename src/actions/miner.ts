import { action, SingletonAction, type KeyAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claudeState } from "../claude-state";
import type { ClaudeState } from "../signal";

type Animation = "parado" | "golpe" | "golpe-cima" | "morte";
type Clip = { frames: string[]; durations: number[] };

const IMG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "imgs", "miner");
// While Claude works, alternate between the two swings, switching only at the end of a swing.
const SWING_PHASE_MS = 3000;

@action({ UUID: "com.sendeskill.devdeck.miner" })
export class Miner extends SingletonAction {
	private clips = new Map<Animation, Clip>();
	private unsubscribe?: () => void;
	private timer?: NodeJS.Timeout;
	private anim: Animation = "parado";
	private frame = 0;
	private phaseStart = Date.now();
	private lastImage = new Map<string, string>();

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		this.lastImage.delete(ev.action.id);
		if (!this.unsubscribe) {
			this.unsubscribe = claudeState.subscribe((s) => this.onState(s));
			this.schedule();
		}
		await this.render();
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.lastImage.delete(ev.action.id);
		if ([...this.actions].length === 0) {
			this.unsubscribe?.();
			this.unsubscribe = undefined;
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	override onKeyDown(): void {
		claudeState.acknowledge();
	}

	private onState(s: ClaudeState): void {
		const next: Animation = s.state === "running" ? "golpe" : s.state === "done" ? "morte" : "parado";
		const swinging = (a: Animation) => a === "golpe" || a === "golpe-cima";
		if (next === this.anim || (swinging(next) && swinging(this.anim))) return;
		this.play(next);
	}

	private play(anim: Animation): void {
		this.anim = anim;
		this.frame = 0;
		this.phaseStart = Date.now();
		void this.render();
		this.schedule();
	}

	private schedule(): void {
		clearTimeout(this.timer);
		const clip = this.clip(this.anim);
		this.timer = setTimeout(() => this.advance(), clip.durations[this.frame] ?? 100);
	}

	private advance(): void {
		const clip = this.clip(this.anim);
		if (this.frame < clip.frames.length - 1) {
			this.frame++;
		} else if (this.anim === "morte") {
			// Death plays once and stays down.
			return;
		} else if ((this.anim === "golpe" || this.anim === "golpe-cima") && Date.now() - this.phaseStart >= SWING_PHASE_MS) {
			this.play(this.anim === "golpe" ? "golpe-cima" : "golpe");
			return;
		} else {
			this.frame = 0;
		}
		void this.render();
		this.schedule();
	}

	private async render(): Promise<void> {
		const image = this.clip(this.anim).frames[this.frame];
		for (const a of this.actions) {
			if (a.isKey() && this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await (a as KeyAction<JsonObject>).setImage(image);
			}
		}
	}

	private clip(anim: Animation): Clip {
		let clip = this.clips.get(anim);
		if (!clip) {
			const meta = JSON.parse(fs.readFileSync(path.join(IMG_DIR, "animations.json"), "utf8")) as Record<string, { frames: number; durations: number[] }>;
			const { frames, durations } = meta[anim];
			clip = {
				frames: Array.from({ length: frames }, (_, i) => {
					const png = fs.readFileSync(path.join(IMG_DIR, anim, `${String(i).padStart(2, "0")}.png`));
					return `data:image/png;base64,${png.toString("base64")}`;
				}),
				durations,
			};
			this.clips.set(anim, clip);
		}
		return clip;
	}
}
