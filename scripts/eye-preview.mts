import fs from "node:fs";
import path from "node:path";
import { renderEye, type EyeStyle } from "../src/eye-render.ts";

const outDir = process.argv[2] ?? ".";
fs.mkdirSync(outDir, { recursive: true });

const poses = [
	{ name: "center", gx: 0, gy: -0.3, open: 1, blink: 1, pupil: 0.45 },
	{ name: "left-up", gx: -0.9, gy: -0.8, open: 1, blink: 1, pupil: 0.45 },
	{ name: "right-down", gx: 0.85, gy: 0.7, open: 1, blink: 1, pupil: 0.8 },
	{ name: "blink", gx: 0.2, gy: -0.2, open: 1, blink: 0.35, pupil: 0.45 },
	{ name: "startle", gx: 0, gy: 0, open: 1.18, blink: 1, pupil: 0 },
];

for (const style of ["demon", "dragon"] as EyeStyle[]) {
	for (const p of poses) {
		const t = performance.now();
		const url = renderEye(style, { ...p, time: 1.2 });
		const ms = (performance.now() - t).toFixed(1);
		const file = path.join(outDir, `${style}-${p.name}.png`);
		fs.writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
		console.log(path.basename(file), `${ms} ms`, `${Math.round(url.length / 1024)} KB`);
	}
}
