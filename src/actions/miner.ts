import { action, SingletonAction, type KeyAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claudeState } from "../claude-state";
import type { ClaudeState } from "../signal";

type Animation = "parado" | "golpe" | "golpe-cima" | "dano" | "estocada" | "morte";
type Clip = { frames: string[]; durations: number[] };
/** A clip shown for `ms`; `once` clips play a single time and hold their last frame. */
type Segment = { anim: Animation; ms: number; once?: boolean };

const IMG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "imgs", "miner");

const SEQUENCES: Record<ClaudeState["state"], Segment[]> = {
	running: [
		{ anim: "golpe", ms: 1500 },
		{ anim: "dano", ms: 3000 },
		{ anim: "golpe", ms: 1500 },
		{ anim: "estocada", ms: 3000 },
	],
	done: [
		{ anim: "golpe", ms: 1500 },
		{ anim: "morte", ms: 3000, once: true },
	],
	idle: [{ anim: "parado", ms: Infinity }],
};

@action({ UUID: "com.sendeskill.devdeck.miner" })
export class Miner extends SingletonAction {
	private clips = new Map<Animation, Clip>();
	private unsubscribe?: () => void;
	private timer?: NodeJS.Timeout;
	private sequence = SEQUENCES.idle;
	private segment = 0;
	private segmentStart = Date.now();
	private frame = 0;
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
		const next = SEQUENCES[s.state] ?? SEQUENCES.idle;
		if (next === this.sequence) return;
		this.sequence = next;
		this.startSegment(0);
	}

	private get current(): Segment {
		return this.sequence[this.segment];
	}

	private startSegment(index: number): void {
		this.segment = index % this.sequence.length;
		this.segmentStart = Date.now();
		this.frame = 0;
		void this.render();
		this.schedule();
	}

	private schedule(): void {
		clearTimeout(this.timer);
		const clip = this.clip(this.current.anim);
		this.timer = setTimeout(() => this.advance(), clip.durations[this.frame] ?? 100);
	}

	private advance(): void {
		const seg = this.current;
		if (Date.now() - this.segmentStart >= seg.ms) {
			this.startSegment(this.segment + 1);
			return;
		}
		const clip = this.clip(seg.anim);
		if (this.frame < clip.frames.length - 1) this.frame++;
		else if (!seg.once) this.frame = 0;
		void this.render();
		this.schedule();
	}

	private async render(): Promise<void> {
		const image = this.clip(this.current.anim).frames[this.frame];
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
