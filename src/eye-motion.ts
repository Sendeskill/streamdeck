import type { CursorPos } from "./cursor";

export type EyePose = { gx: number; gy: number; open: number; blink: number; pupil: number; time: number };

// The deck sits below the monitor, so looking at the screen means looking up.
const UPWARD_BIAS = -0.35;
const SACCADE_THRESHOLD = 0.07;
const WANDER_AFTER_MS = 6000;
const SLEEP_AFTER_MS = 3 * 60 * 1000;
const STARTLE_MS = 900;
const BLINK_CLOSE_MS = 70;
const BLINK_HOLD_MS = 35;
const BLINK_OPEN_MS = 150;

/** One shared "creature": every eye key moves and blinks together, like a pair of eyes. */
export class EyeMotion {
	private gx = 0;
	private gy = UPWARD_BIAS;
	private saccade?: { fromX: number; fromY: number; toX: number; toY: number; start: number; dur: number };
	private nextMicro = 0;
	private wander?: { x: number; y: number };
	private nextWander = 0;
	private blinkStart = -1e9;
	private nextBlink = Date.now() + 2000;
	private queuedBlink = 0;
	private open = 1;
	private pupil = 0.45;
	private startleUntil = 0;
	private wasAsleep = false;

	startle(now = Date.now()): void {
		this.startleUntil = now + STARTLE_MS;
	}

	step(cursorPos: CursorPos | undefined, lastMove: number, now = Date.now()): EyePose {
		const idle = now - lastMove;
		const asleep = idle > SLEEP_AFTER_MS;
		const startled = now < this.startleUntil;

		if (this.wasAsleep && !asleep) this.triggerBlink(now);
		this.wasAsleep = asleep;

		const target = this.target(cursorPos, idle, asleep, now);
		this.moveGaze(target, asleep, now);
		const blink = this.blinkAmount(asleep, now);

		const openTarget = startled ? 1.18 : asleep ? 0 : 1;
		this.open += (openTarget - this.open) * (asleep ? 0.035 : startled ? 0.5 : 0.22);

		const t = now / 1000;
		const hippus = 0.05 * Math.sin(t * 0.83) + 0.03 * Math.sin(t * 2.1 + 1.1);
		const pupilTarget = startled ? 0.02 : 0.42 + hippus;
		this.pupil += (pupilTarget - this.pupil) * (startled ? 0.5 : 0.08);

		return { gx: this.gx, gy: this.gy, open: this.open, blink, pupil: this.pupil, time: t };
	}

	private target(p: CursorPos | undefined, idle: number, asleep: boolean, now: number): { x: number; y: number } {
		const cursorTarget = p
			? {
					x: clamp(((p.x - p.left) / p.width) * 2 - 1),
					y: clamp(UPWARD_BIAS + (((p.y - p.top) / p.height) * 2 - 1) * 0.7),
				}
			: { x: 0, y: UPWARD_BIAS };

		if (asleep || idle < WANDER_AFTER_MS) {
			this.wander = undefined;
			return cursorTarget;
		}
		if (now >= this.nextWander) {
			this.wander = Math.random() < 0.35 ? undefined : { x: rand(-0.85, 0.85), y: rand(-0.75, 0.35) };
			this.nextWander = now + rand(1200, 4000);
		}
		return this.wander ?? cursorTarget;
	}

	private moveGaze(target: { x: number; y: number }, asleep: boolean, now: number): void {
		const s = this.saccade;
		if (s) {
			const p = Math.min(1, (now - s.start) / s.dur);
			const e = 1 - Math.pow(1 - p, 3);
			this.gx = s.fromX + (s.toX - s.fromX) * e;
			this.gy = s.fromY + (s.toY - s.fromY) * e;
			if (p >= 1) this.saccade = undefined;
			return;
		}

		const dist = Math.hypot(target.x - this.gx, target.y - this.gy);
		if (dist > SACCADE_THRESHOLD) {
			// Saccades overshoot a touch less than they need; pursuit closes the rest.
			this.startSaccade(target.x - (target.x - this.gx) * 0.03, target.y - (target.y - this.gy) * 0.03, dist, now);
			if (dist > 0.55 && !asleep && Math.random() < 0.3) this.triggerBlink(now);
		} else if (dist > 0.004) {
			this.gx += (target.x - this.gx) * 0.2;
			this.gy += (target.y - this.gy) * 0.2;
		} else if (!asleep && now >= this.nextMicro) {
			this.startSaccade(clamp(this.gx + rand(-0.03, 0.03)), clamp(this.gy + rand(-0.025, 0.025)), 0.03, now);
			this.nextMicro = now + rand(500, 1800);
		}
	}

	private startSaccade(toX: number, toY: number, dist: number, now: number): void {
		this.saccade = { fromX: this.gx, fromY: this.gy, toX, toY, start: now, dur: 30 + 110 * Math.min(1, dist) };
	}

	private triggerBlink(now: number): void {
		if (now - this.blinkStart < BLINK_CLOSE_MS + BLINK_HOLD_MS + BLINK_OPEN_MS) return;
		this.blinkStart = now;
		this.nextBlink = now + rand(2200, 6500);
		if (Math.random() < 0.18) this.queuedBlink = now + 330;
	}

	private blinkAmount(asleep: boolean, now: number): number {
		if (!asleep) {
			if (this.queuedBlink && now >= this.queuedBlink) {
				this.queuedBlink = 0;
				this.triggerBlink(now);
			} else if (now >= this.nextBlink) {
				this.triggerBlink(now);
			}
		}
		const t = now - this.blinkStart;
		if (t < 0) return 1;
		if (t < BLINK_CLOSE_MS) return 1 - easeIn(t / BLINK_CLOSE_MS);
		if (t < BLINK_CLOSE_MS + BLINK_HOLD_MS) return 0;
		const o = (t - BLINK_CLOSE_MS - BLINK_HOLD_MS) / BLINK_OPEN_MS;
		return o < 1 ? easeOut(o) : 1;
	}
}

function easeIn(t: number): number {
	return t * t;
}

function easeOut(t: number): number {
	return 1 - (1 - t) * (1 - t) * (1 - t);
}

function rand(a: number, b: number): number {
	return a + Math.random() * (b - a);
}

function clamp(v: number): number {
	return Math.max(-1, Math.min(1, v));
}
