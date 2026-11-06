import ical, { type CalendarResponse, type VEvent } from "node-ical";

export type Meeting = {
	start: Date;
	end: Date;
	title: string;
};

const LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;

export async function fetchNextMeeting(icsUrl: string, now = new Date()): Promise<Meeting | undefined> {
	const res = await fetch(icsUrl);
	if (!res.ok) {
		throw new Error(`HTTP ${res.status}`);
	}
	return nextMeeting(ical.sync.parseICS(await res.text()), now);
}

export function nextMeeting(data: CalendarResponse, now: Date): Meeting | undefined {
	const to = new Date(now.getTime() + LOOKAHEAD_MS);
	let best: Meeting | undefined;

	for (const component of Object.values(data)) {
		const item = component as VEvent;
		// Overrides are folded into their base event by expandRecurringEvent.
		if (!item || item.type !== "VEVENT" || item.recurrenceid) {
			continue;
		}
		for (const inst of ical.expandRecurringEvent(item, { from: now, to })) {
			const ev = inst.event;
			if (inst.isFullDay || inst.start <= now || !isBusy(ev)) {
				continue;
			}
			if (!best || inst.start < best.start) {
				best = {
					start: inst.start,
					end: inst.end,
					title: text(inst.summary) || "(sem título)",
				};
			}
		}
	}
	return best;
}

function isBusy(ev: VEvent): boolean {
	const busy = (ev as unknown as Record<string, unknown>)["MICROSOFT-CDO-BUSYSTATUS"];
	return ev.status !== "CANCELLED" && ev.transparency !== "TRANSPARENT" && busy !== "FREE";
}

function text(value: unknown): string {
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && "val" in value) return String((value as { val: unknown }).val);
	return "";
}
