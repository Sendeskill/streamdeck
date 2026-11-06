import { EyeMotion } from "../src/eye-motion.ts";

const m = new EyeMotion();
const t0 = Date.now();
const screen = { left: 0, top: 0, width: 3840, height: 1200 };
let lastMove = t0;
let prev = "";

for (let ms = 0; ms <= 9000; ms += 33) {
	const now = t0 + ms;
	// Cursor: centre, jump to the far right at 1s, slow drag left from 3s to 5s, then still.
	let x = 1920;
	if (ms >= 1000) x = 3600;
	if (ms >= 3000) x = 3600 - Math.min(2000, ((ms - 3000) / 2000) * 2000);
	if (ms < 5000) lastMove = now;
	const p = m.step({ x, y: 600, ...screen }, lastMove, now);
	const line = `gx=${p.gx.toFixed(2)} gy=${p.gy.toFixed(2)} blink=${p.blink.toFixed(2)} open=${p.open.toFixed(2)} pupil=${p.pupil.toFixed(2)}`;
	if (line !== prev && (ms % 330 === 0 || p.blink < 1 || Math.abs(ms - 1000) < 200)) console.log(String(ms).padStart(5), line);
	prev = line;
}
