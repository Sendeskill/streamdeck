export type KeyFace = {
	background: string;
	lines: { text: string; size: number; color?: string; bold?: boolean }[];
};

export function svgKey(face: KeyFace): string {
	const total = face.lines.reduce((sum, l) => sum + l.size * 1.25, 0);
	let y = (144 - total) / 2;
	const texts = face.lines
		.map((l) => {
			y += l.size * 1.25;
			return `<text x="72" y="${(y - l.size * 0.3).toFixed(1)}" font-family="Segoe UI, Arial, sans-serif" font-size="${l.size}" font-weight="${l.bold ? 700 : 400}" fill="${l.color ?? "#fff"}" text-anchor="middle">${escape(l.text)}</text>`;
		})
		.join("");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="${face.background}"/>${texts}</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

export function fit(text: string, max: number): string {
	return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

function escape(s: string): string {
	return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
