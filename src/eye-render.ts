import { deflateSync } from "node:zlib";

export type EyeStyle = "demon" | "dragon";

export type EyeState = {
	/** Gaze direction, -1..1 on each axis (y down). */
	gx: number;
	gy: number;
	/** Overall lid opening: 0 closed (sleep), 1 normal, >1 wide. */
	open: number;
	/** Blink progress: 1 open, 0 shut. */
	blink: number;
	/** Pupil size: 0 narrow slit, 1 dilated. */
	pupil: number;
	/** Seconds, drives the demon's ember flicker. */
	time: number;
};

type RGB = [number, number, number];

type StyleDef = {
	irisAngle: number;
	pupilWidth: [number, number];
	pupilHeight: number;
	irisStops: [number, RGB][];
	collar: RGB;
	irisEmit: RGB;
	irisEmitStrength: number;
	sclera: RGB;
	scleraEdge: RGB;
	vein: RGB;
	veinEmit: number;
	veinAmount: number;
	veinSharp: [number, number];
	caruncle: RGB;
	spec: number;
	lidHalfWidth: number;
	lidTop: number;
	lidBottom: number;
	lidAsym: number;
	skinGlow: RGB;
	skinGlowStrength: number;
	flicker: boolean;
	flecks: number;
};

const S = 144;
const C = 72;
const EYE_R = 60;
const MAX_YAW = 0.62;
const MAX_PITCH = 0.42;
const IRIS_A = 720;
const IRIS_R = 160;
const VEIN_W = 360;
const VEIN_H = 180;

const STYLES: Record<EyeStyle, StyleDef> = {
	demon: {
		irisAngle: 0.52,
		pupilWidth: [0.06, 0.3],
		pupilHeight: 0.9,
		irisStops: [
			[0, srgb(255, 230, 140)],
			[0.2, srgb(255, 140, 25)],
			[0.45, srgb(200, 35, 6)],
			[0.75, srgb(95, 6, 3)],
			[1, srgb(18, 0, 0)],
		],
		collar: srgb(255, 170, 60),
		irisEmit: srgb(255, 100, 15),
		irisEmitStrength: 0.75,
		sclera: srgb(26, 7, 6),
		scleraEdge: srgb(6, 1, 1),
		vein: srgb(200, 30, 8),
		veinEmit: 0.25,
		veinAmount: 0.55,
		veinSharp: [0.93, 0.985],
		caruncle: srgb(60, 8, 6),
		spec: 0.7,
		lidHalfWidth: 64,
		lidTop: 33,
		lidBottom: 27,
		lidAsym: 0.32,
		skinGlow: srgb(255, 60, 10),
		skinGlowStrength: 0.14,
		flicker: true,
		flecks: 0,
	},
	dragon: {
		irisAngle: 0.78,
		pupilWidth: [0.05, 0.32],
		pupilHeight: 0.93,
		irisStops: [
			[0, srgb(255, 240, 170)],
			[0.3, srgb(250, 190, 40)],
			[0.6, srgb(200, 120, 15)],
			[0.85, srgb(90, 95, 20)],
			[1, srgb(20, 35, 8)],
		],
		collar: srgb(255, 230, 120),
		irisEmit: srgb(255, 190, 60),
		irisEmitStrength: 0.12,
		sclera: srgb(150, 120, 50),
		scleraEdge: srgb(60, 45, 15),
		vein: srgb(70, 30, 8),
		veinEmit: 0,
		veinAmount: 0.6,
		veinSharp: [0.88, 0.97],
		caruncle: srgb(70, 40, 18),
		spec: 1,
		lidHalfWidth: 64,
		lidTop: 38,
		lidBottom: 31,
		lidAsym: 0.12,
		skinGlow: srgb(255, 200, 80),
		skinGlowStrength: 0.06,
		flicker: false,
		flecks: 1,
	},
};

type Textures = {
	iris: Float32Array; // rgb + emit rgb per texel
	veins: Float32Array;
	skin: Float32Array; // linear rgb
	cracks: Float32Array; // emissive mask (demon)
};

const textures = new Map<EyeStyle, Textures>();

const LIGHT = norm([-0.45, -0.55, 0.7]);
const KEY_REFLECT = norm([-0.38, -0.48, 0.79]);
const FILL_REFLECT = norm([0.42, 0.3, 0.86]);

export function renderEye(style: EyeStyle, st: EyeState): string {
	const def = STYLES[style];
	const tex = texturesFor(style);
	const out = new Uint8Array(S * S * 3);

	const yaw = st.gx * MAX_YAW;
	const pitch = st.gy * MAX_PITCH;
	const fx = Math.sin(yaw) * Math.cos(pitch);
	const fy = Math.sin(pitch);
	const fz = Math.cos(yaw) * Math.cos(pitch);
	// Iris basis: r points right, u points down, both perpendicular to the gaze f.
	const rl = Math.hypot(fz, fx);
	const rx = fz / rl;
	const rz = -fx / rl;
	const ux = fy * rz;
	const uy = fz * rx - fx * rz;
	const uz = -fy * rx;

	const cosIris = Math.cos(def.irisAngle);
	const sinIris = Math.sin(def.irisAngle);
	const irisPx = def.irisAngle * EYE_R;
	const pw = def.pupilWidth[0] + (def.pupilWidth[1] - def.pupilWidth[0]) * clamp01(st.pupil);
	const ph = def.pupilHeight;
	const pupilPx = pw * sinIris * EYE_R;

	const openS = Math.max(0, st.open);
	const blink = clamp01(st.blink);
	const shiftX = st.gx * 3;
	const mid = C + 4;
	const topGaze = 1 - 0.22 * st.gy;
	const botGaze = 1 + 0.12 * st.gy;
	const flick = def.flicker ? 0.82 + 0.1 * Math.sin(st.time * 2.3) + 0.08 * Math.sin(st.time * 5.1 + 1.3) : 1;
	const crackPulse = def.flicker ? 0.55 + 0.45 * Math.sin(st.time * 1.4) : 0;
	const irisGlowVis = clamp01(openS) * blink;

	for (let py = 0; py < S; py++) {
		const y = py + 0.5;
		for (let px = 0; px < S; px++) {
			const x = px + 0.5;
			const i = (py * S + px) * 3;

			// Lid geometry: almond opening, upper lid descends over the lower one to blink.
			const dx = x - C - shiftX;
			const f = 1 - (dx / def.lidHalfWidth) ** 2;
			let edge = -99;
			let dTop = -99;
			let dBot = -99;
			let dTopRest = 99;
			if (f > 0) {
				const shape = Math.pow(f, 0.72);
				const asym = 1 + def.lidAsym * (dx / def.lidHalfWidth);
				const bottom = mid + def.lidBottom * shape * botGaze * openS * (0.72 + 0.28 * blink);
				const topFull = mid - def.lidTop * shape * asym * topGaze * openS;
				const top = bottom - (bottom - topFull) * blink;
				const topRest = mid - def.lidTop * shape * asym * topGaze;
				dTop = y - top;
				dBot = bottom - y;
				dTopRest = topRest - y;
				edge = Math.min(dTop, dBot);
			}

			let r: number;
			let g: number;
			let b: number;

			// Skin, shaded as lid folds around the opening.
			{
				r = tex.skin[i];
				g = tex.skin[i + 1];
				b = tex.skin[i + 2];
				let mod = 1;
				if (f > 0) {
					if (dTop < 0) {
						const d = -dTop;
						const dr = Math.max(0, dTopRest);
						mod *= 1 - 0.6 * Math.exp(-d / 1.6);
						mod *= 1 + 0.22 * Math.exp(-(((dr - 7) / 5) ** 2)) - 0.4 * Math.exp(-(((dr - 17) / 3.5) ** 2));
					} else if (dBot < 0) {
						const d = -dBot;
						mod *= 1 - 0.55 * Math.exp(-d / 1.5);
						mod *= 1 + 0.14 * Math.exp(-(((d - 5) / 4) ** 2)) - 0.22 * Math.exp(-(((d - 12) / 3) ** 2));
					}
				}
				r *= mod;
				g *= mod;
				b *= mod;
				const crack = tex.cracks[py * S + px];
				if (crack > 0) {
					r += def.skinGlow[0] * crack * crackPulse;
					g += def.skinGlow[1] * crack * crackPulse;
					b += def.skinGlow[2] * crack * crackPulse;
				}
				if (def.skinGlowStrength > 0 && edge > -40) {
					const gl = def.skinGlowStrength * Math.exp(Math.min(0, edge) / 7) * irisGlowVis * flick;
					r += def.skinGlow[0] * gl;
					g += def.skinGlow[1] * gl;
					b += def.skinGlow[2] * gl;
				}
			}

			const a = clamp01(edge + 0.5);
			if (a > 0) {
				let er: number;
				let eg: number;
				let eb: number;
				const X = (x - C) / EYE_R;
				const Y = (y - C) / EYE_R;
				const rr2 = X * X + Y * Y;
				const shadow = (0.3 + 0.7 * smoothstep(0, 15, dTop)) * (0.72 + 0.28 * smoothstep(0, 5, dBot));

				if (rr2 >= 1) {
					er = def.caruncle[0] * shadow;
					eg = def.caruncle[1] * shadow;
					eb = def.caruncle[2] * shadow;
				} else {
					const Z = Math.sqrt(1 - rr2);
					const cosA = X * fx + Y * fy + Z * fz;
					const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
					const lx = X * rx + Z * rz;
					const ly = X * ux + Y * uy + Z * uz;

					const diffuse = Math.max(0, X * LIGHT[0] + Y * LIGHT[1] + Z * LIGHT[2]);
					const light = (0.32 + 0.78 * diffuse) * shadow;

					// Sclera with veins thickening toward the edges.
					const edgeT = smoothstep(def.irisAngle + 0.1, 1.45, alpha);
					let sr = def.sclera[0] + (def.scleraEdge[0] - def.sclera[0]) * edgeT;
					let sg = def.sclera[1] + (def.scleraEdge[1] - def.sclera[1]) * edgeT;
					let sb = def.sclera[2] + (def.scleraEdge[2] - def.sclera[2]) * edgeT;
					const lon = Math.atan2(lx, cosA);
					const lat = Math.asin(Math.max(-1, Math.min(1, ly)));
					const vi = Math.floor(((lon / Math.PI + 1) / 2) * (VEIN_W - 1));
					const vj = Math.floor((lat / Math.PI + 0.5) * (VEIN_H - 1));
					const vein = tex.veins[vj * VEIN_W + vi] * def.veinAmount * smoothstep(def.irisAngle + 0.05, def.irisAngle + 0.8, alpha);
					sr += (def.vein[0] - sr) * vein;
					sg += (def.vein[1] - sg) * vein;
					sb += (def.vein[2] - sb) * vein;
					er = sr * light + def.vein[0] * vein * def.veinEmit * flick;
					eg = sg * light + def.vein[1] * vein * def.veinEmit * flick;
					eb = sb * light + def.vein[2] * vein * def.veinEmit * flick;

					// Iris cap.
					const t = alpha / def.irisAngle;
					if (t < 1.05) {
						const ia = clamp01((1 - t) * irisPx + 0.5);
						const ang = Math.atan2(ly, lx);
						const ti = Math.floor(((ang / (2 * Math.PI) + 1) % 1) * IRIS_A) % IRIS_A;
						const tj = Math.min(IRIS_R - 1, Math.floor(Math.min(1, t) * (IRIS_R - 1)));
						const k = (tj * IRIS_A + ti) * 6;
						let ir = tex.iris[k];
						let ig = tex.iris[k + 1];
						let ib = tex.iris[k + 2];
						let emit = def.irisEmitStrength * flick * (def.flicker ? 0.85 + 0.15 * Math.sin(st.time * 3 + ang * 3 + t * 9) : 1);
						let mr = tex.iris[k + 3] * emit;
						let mg = tex.iris[k + 4] * emit;
						let mb = tex.iris[k + 5] * emit;

						// Slit pupil with pointed ends, in the iris disc plane.
						const dxp = lx / sinIris;
						const dyp = ly / sinIris;
						const yy = Math.abs(dyp) / ph;
						const halfW = pw * Math.pow(Math.max(0, 1 - yy * yy), 0.65);
						const e = halfW > 1e-4 ? Math.abs(dxp) / halfW : 99;
						const pa = yy < 1 ? clamp01((1 - e) * Math.min(pupilPx, halfW * sinIris * EYE_R) + 0.5) : 0;
						const rim = 0.55 + 0.45 * smoothstep(1, 2.2, e);
						ir *= rim;
						ig *= rim;
						ib *= rim;
						const hot = def.flicker ? Math.exp(-Math.max(0, e - 1) * 2.5) * 0.6 * (1 - pa) : 0;
						mr = (mr + def.irisEmit[0] * hot * emit) * (1 - pa);
						mg = (mg + def.irisEmit[1] * hot * emit) * (1 - pa);
						mb = (mb + def.irisEmit[2] * hot * emit) * (1 - pa);
						ir *= 1 - pa;
						ig *= 1 - pa;
						ib *= 1 - pa;

						const irisLight = (0.45 + 0.55 * diffuse) * shadow;
						er = er * (1 - ia) + (ir * irisLight + mr) * ia;
						eg = eg * (1 - ia) + (ig * irisLight + mg) * ia;
						eb = eb * (1 - ia) + (ib * irisLight + mb) * ia;
					}

					// Wet cornea: bulge the normal over the iris and add reflections.
					const bump = 1 - smoothstep(0, def.irisAngle * 1.3, alpha);
					let nx = X + fx * 0.4 * bump;
					let ny = Y + fy * 0.4 * bump;
					let nz = Z + fz * 0.4 * bump;
					const nl = Math.hypot(nx, ny, nz);
					nx /= nl;
					ny /= nl;
					nz /= nl;
					const rvx = 2 * nz * nx;
					const rvy = 2 * nz * ny;
					const rvz = 2 * nz * nz - 1;
					const kd = rvx * KEY_REFLECT[0] + rvy * KEY_REFLECT[1] + rvz * KEY_REFLECT[2];
					const fd = rvx * FILL_REFLECT[0] + rvy * FILL_REFLECT[1] + rvz * FILL_REFLECT[2];
					const specMask = smoothstep(0, 7, dTop);
					const spec =
						def.spec *
						specMask *
						(1.6 * smoothstep(0.983, 0.993, kd) + 0.35 * smoothstep(0.994, 0.998, fd) + 0.1 * Math.pow(Math.max(0, kd), 24));
					er += spec;
					eg += spec;
					eb += spec * 0.97;
				}

				// Lash line and the wet rim of the lower lid.
				if (dTop < 1.6) {
					const k = 1 - 0.7 * (1 - dTop / 1.6);
					er *= k;
					eg *= k;
					eb *= k;
				}
				if (dBot < 2.2) {
					const w = 0.18 * (1 - Math.abs(dBot - 1.1) / 1.1) * clamp01(openS);
					if (w > 0) {
						er += w;
						eg += w;
						eb += w;
					}
				}

				r = r * (1 - a) + er * a;
				g = g * (1 - a) + eg * a;
				b = b * (1 - a) + eb * a;
			}

			out[i] = toSrgbByte(r);
			out[i + 1] = toSrgbByte(g);
			out[i + 2] = toSrgbByte(b);
		}
	}
	return `data:image/png;base64,${encodePng(out).toString("base64")}`;
}

function texturesFor(style: EyeStyle): Textures {
	let t = textures.get(style);
	if (!t) {
		const def = STYLES[style];
		t = { iris: buildIris(def, style === "demon" ? 11 : 23), veins: buildVeins(style === "demon" ? 5 : 9, def.veinSharp), ...buildSkin(style) };
		textures.set(style, t);
	}
	return t;
}

function buildIris(def: StyleDef, seed: number): Float32Array {
	const tex = new Float32Array(IRIS_A * IRIS_R * 6);
	for (let j = 0; j < IRIS_R; j++) {
		const r = j / (IRIS_R - 1);
		for (let i = 0; i < IRIS_A; i++) {
			const u = i / IRIS_A;
			const fine = fbmP(u * 96, r * 5, 96, seed, 3);
			const coarse = fbmP(u * 28, r * 2.5, 28, seed + 7, 3);
			const fibre = 0.55 * fine + 0.45 * coarse;
			const collarR = 0.4 + 0.07 * (valueP(u * 14, 0.3, 14, seed + 3) - 0.5);
			const collar = Math.exp(-(((r - collarR) / 0.04) ** 2));
			const crypt = smoothstep(0.6, 0.74, fbmP(u * 44, r * 7, 44, seed + 11, 2)) * smoothstep(0.42, 0.5, r) * (1 - smoothstep(0.8, 0.88, r));
			const limbal = smoothstep(0.76, 1, r);
			const ring = 0.92 + 0.08 * Math.sin(r * 40 + fine * 6);

			const base = gradient(def.irisStops, r);
			let k = (0.8 + 1.4 * (fibre - 0.5)) * ring * (1 - 0.55 * crypt) * (1 - 0.8 * limbal);
			k = Math.max(0.05, k);
			let cr = base[0] * k + def.collar[0] * collar * 0.3;
			let cg = base[1] * k + def.collar[1] * collar * 0.3;
			let cb = base[2] * k + def.collar[2] * collar * 0.3;
			if (def.flecks > 0) {
				const fleck = smoothstep(0.86, 0.92, valueP(u * 160, r * 24, 160, seed + 31)) * (1 - limbal);
				cr += 0.3 * fleck;
				cg += 0.24 * fleck;
				cb += 0.08 * fleck;
			}
			const heat = Math.pow(1 - r, 2.2) * (0.4 + fibre) * (1 - 0.6 * crypt);
			const o = (j * IRIS_A + i) * 6;
			tex[o] = cr;
			tex[o + 1] = cg;
			tex[o + 2] = cb;
			tex[o + 3] = def.irisEmit[0] * heat;
			tex[o + 4] = def.irisEmit[1] * heat;
			tex[o + 5] = def.irisEmit[2] * heat;
		}
	}
	return tex;
}

function buildVeins(seed: number, [lo, hi]: [number, number]): Float32Array {
	const tex = new Float32Array(VEIN_W * VEIN_H);
	for (let j = 0; j < VEIN_H; j++) {
		for (let i = 0; i < VEIN_W; i++) {
			const u = i / VEIN_W;
			const v = j / VEIN_H;
			const n1 = 1 - Math.abs(2 * fbmP(u * 10, v * 6, 10, seed, 4) - 1);
			const n2 = 1 - Math.abs(2 * fbmP(u * 22, v * 12, 22, seed + 5, 3) - 1);
			tex[j * VEIN_W + i] = Math.max(smoothstep(lo, hi, n1), 0.6 * smoothstep(lo + 0.02, Math.min(0.995, hi + 0.01), n2));
		}
	}
	return tex;
}

function buildSkin(style: EyeStyle): { skin: Float32Array; cracks: Float32Array } {
	const skin = new Float32Array(S * S * 3);
	const cracks = new Float32Array(S * S);
	for (let y = 0; y < S; y++) {
		for (let x = 0; x < S; x++) {
			const i = y * S + x;
			const vignette = 1 - 0.55 * (Math.hypot(x - C, (y - C) * 1.2) / (C * 1.45)) ** 2;
			let c: RGB;
			if (style === "demon") {
				const ang = Math.atan2(y - C, x - C);
				const dist = Math.hypot(x - C, y - C);
				const wrinkle = fbmP(((ang / (2 * Math.PI) + 1) % 1) * 60, dist / 30, 60, 3, 3);
				const pores = fbm(x * 0.35, y * 0.35, 9, 2);
				const n = 0.55 * wrinkle + 0.45 * pores;
				c = [lerp(0.025, 0.1, n), lerp(0.004, 0.014, n), lerp(0.003, 0.01, n)];
				const ridge = 1 - Math.abs(2 * fbm(x * 0.05, y * 0.05, 17, 4) - 1);
				cracks[i] = smoothstep(0.972, 0.995, ridge) * 0.22 * smoothstep(30, 60, dist);
			} else {
				c = dragonScale(x, y);
			}
			skin[i * 3] = c[0] * vignette;
			skin[i * 3 + 1] = c[1] * vignette;
			skin[i * 3 + 2] = c[2] * vignette;
		}
	}
	return { skin, cracks };
}

function dragonScale(x: number, y: number): RGB {
	const dist = Math.hypot(x - C, y - C);
	const size = 8 + 0.07 * dist;
	const sx = x / size;
	const sy = y / size;
	const cx = Math.floor(sx);
	const cy = Math.floor(sy);
	let f1 = 9;
	let f2 = 9;
	let ox = 0;
	let oy = 0;
	let id = 0;
	for (let j = -1; j <= 1; j++) {
		for (let k = -1; k <= 1; k++) {
			const gx = cx + k;
			const gy = cy + j;
			const px = gx + 0.15 + 0.7 * hash(gx, gy, 41);
			const py = gy + 0.15 + 0.7 * hash(gx, gy, 43);
			const d = Math.hypot(sx - px, sy - py);
			if (d < f1) {
				f2 = f1;
				f1 = d;
				ox = sx - px;
				oy = sy - py;
				id = hash(gx, gy, 47);
			} else if (d < f2) {
				f2 = d;
			}
		}
	}
	const edge = smoothstep(0.02, 0.12, f2 - f1);
	const h = Math.max(0, 1 - f1 / 0.62);
	const nz = Math.sqrt(h);
	const shade = 0.35 + 0.65 * clamp01(-ox * 0.5 - oy * 0.7 + nz * 0.6);
	const gloss = 0.25 * Math.pow(clamp01(-ox * 0.6 - oy * 0.8 + 0.2), 6) * h;
	const hue = id;
	const base: RGB = [lerp(0.018, 0.05, hue), lerp(0.07, 0.12, hue), lerp(0.02, 0.035, 1 - hue)];
	const k = shade * (0.35 + 0.65 * edge);
	return [base[0] * k + gloss * 0.6, base[1] * k + gloss * 0.8, base[2] * k + gloss * 0.4];
}

function hash(x: number, y: number, seed: number): number {
	let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967295;
}

function valueP(x: number, y: number, period: number, seed: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = x - ix;
	const fy = y - iy;
	const ux = fx * fx * (3 - 2 * fx);
	const uy = fy * fy * (3 - 2 * fy);
	const x0 = ((ix % period) + period) % period;
	const x1 = (x0 + 1) % period;
	const a = hash(x0, iy, seed);
	const b = hash(x1, iy, seed);
	const c = hash(x0, iy + 1, seed);
	const d = hash(x1, iy + 1, seed);
	return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

function fbmP(x: number, y: number, period: number, seed: number, octaves: number): number {
	let sum = 0;
	let amp = 0.5;
	let norm = 0;
	let f = 1;
	for (let o = 0; o < octaves; o++) {
		sum += amp * valueP(x * f, y * f, period * f, seed + o * 13);
		norm += amp;
		amp *= 0.5;
		f *= 2;
	}
	return sum / norm;
}

function fbm(x: number, y: number, seed: number, octaves: number): number {
	return fbmP(x, y, 1 << 20, seed, octaves);
}

function gradient(stops: [number, RGB][], t: number): RGB {
	for (let i = 1; i < stops.length; i++) {
		const [t1, c1] = stops[i];
		if (t <= t1) {
			const [t0, c0] = stops[i - 1];
			const k = (t - t0) / (t1 - t0);
			return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
		}
	}
	return stops[stops.length - 1][1];
}

function srgb(r: number, g: number, b: number): RGB {
	return [Math.pow(r / 255, 2.2), Math.pow(g / 255, 2.2), Math.pow(b / 255, 2.2)];
}

function norm(v: RGB): RGB {
	const l = Math.hypot(v[0], v[1], v[2]);
	return [v[0] / l, v[1] / l, v[2] / l];
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a: number, b: number, v: number): number {
	const t = clamp01((v - a) / (b - a));
	return t * t * (3 - 2 * t);
}

const GAMMA_LUT = (() => {
	const lut = new Uint8Array(4097);
	for (let i = 0; i <= 4096; i++) lut[i] = Math.round(255 * Math.pow(i / 4096, 1 / 2.2));
	return lut;
})();

function toSrgbByte(v: number): number {
	return v <= 0 ? 0 : v >= 1 ? 255 : GAMMA_LUT[(v * 4096) | 0];
}

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(buf: Buffer): number {
	let c = 0xffffffff;
	for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

function encodePng(rgb: Uint8Array): Buffer {
	const stride = S * 3;
	const raw = Buffer.alloc((stride + 1) * S);
	for (let y = 0; y < S; y++) {
		raw[y * (stride + 1)] = 0;
		raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(S, 0);
	ihdr.writeUInt32BE(S, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw, { level: 3 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}
