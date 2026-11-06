import { renderEye, type EyeStyle } from "../src/eye-render.ts";

for (const style of ["demon", "dragon"] as EyeStyle[]) {
	renderEye(style, { gx: 0, gy: 0, open: 1, blink: 1, pupil: 0.4, time: 0 });
	const n = 120;
	const t = performance.now();
	let bytes = 0;
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2;
		bytes += renderEye(style, { gx: Math.cos(a) * 0.8, gy: Math.sin(a) * 0.6, open: 1, blink: 1, pupil: 0.4, time: i / 60 }).length;
	}
	const ms = (performance.now() - t) / n;
	console.log(`${style}: ${ms.toFixed(2)} ms/frame -> max ${Math.floor(1000 / ms)} fps, ~${Math.round(bytes / n / 1024)} KB/frame`);
}
