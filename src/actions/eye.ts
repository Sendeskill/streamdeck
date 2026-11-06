import { action, SingletonAction, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { cursor } from "../cursor";
import { EyeMotion } from "../eye-motion";
import { renderEye, type EyeStyle } from "../eye-render";

type Settings = { style?: EyeStyle };

const FRAME_MS = 16;
// The demon's embers flicker; refresh it at a slower cadence than motion when the eye is still.
const FLICKER_STEP_S = 0.15;

@action({ UUID: "com.sendeskill.devdeck.eye" })
export class EyeAction extends SingletonAction<Settings> {
	private styles = new Map<string, EyeStyle>();
	private lastFrame = new Map<string, string>();
	private motion = new EyeMotion();
	private timer?: NodeJS.Timeout;
	private rendering = false;

	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		if (!this.styles.has(ev.action.id)) cursor.acquire();
		this.styles.set(ev.action.id, styleOf(ev.payload.settings));
		this.lastFrame.delete(ev.action.id);
		this.timer ??= setInterval(() => void this.tick(), FRAME_MS);
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		if (!this.styles.delete(ev.action.id)) return;
		this.lastFrame.delete(ev.action.id);
		cursor.release();
		if (this.styles.size === 0) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
		if (this.styles.has(ev.action.id)) {
			this.styles.set(ev.action.id, styleOf(ev.payload.settings));
			this.lastFrame.delete(ev.action.id);
		}
	}

	override onKeyDown(_ev: KeyDownEvent<Settings>): void {
		this.motion.startle();
	}

	private async tick(): Promise<void> {
		if (this.rendering) return;
		this.rendering = true;
		try {
			const pose = this.motion.step(cursor.pos, cursor.lastMove);
			for (const a of this.actions) {
				const style = this.styles.get(a.id);
				if (!style || !a.isKey()) continue;
				const time = style === "demon" ? Math.floor(pose.time / FLICKER_STEP_S) * FLICKER_STEP_S : 0;
				const key = `${style}|${q(pose.gx, 3)}|${q(pose.gy, 3)}|${q(pose.open, 2)}|${q(pose.blink, 2)}|${q(pose.pupil, 2)}|${time}`;
				if (this.lastFrame.get(a.id) === key) continue;
				this.lastFrame.set(a.id, key);
				await (a as KeyAction<Settings>).setImage(renderEye(style, { ...pose, time }));
			}
		} finally {
			this.rendering = false;
		}
	}
}

function styleOf(settings: Settings): EyeStyle {
	return settings.style === "dragon" ? "dragon" : "demon";
}

function q(v: number, digits: number): string {
	return v.toFixed(digits);
}
