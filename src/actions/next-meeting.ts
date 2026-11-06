import streamDeck, { action, SingletonAction, type KeyAction, type KeyDownEvent, type WillAppearEvent, type DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { fetchNextMeeting, type Meeting } from "../calendar";
import { focusOrLaunchOutlook } from "../outlook";
import { fit, svgKey } from "../render";

type Settings = { icsUrl?: string };

const REFRESH_MS = 5 * 60 * 1000;
const ALERT_MS = 10 * 60 * 1000;

@action({ UUID: "com.sendeskill.devdeck.next-meeting" })
export class NextMeeting extends SingletonAction<Settings> {
	private icsUrl?: string;
	private meeting?: Meeting;
	private error?: string;
	private fetchedAt = 0;
	private lastImage = new Map<string, string>();
	private timer?: NodeJS.Timeout;

	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		this.useSettings(ev.payload.settings);
		this.timer ??= setInterval(() => void this.tick(), 500);
		await this.tick();
	}

	override onWillDisappear(): void {
		if ([...this.actions].length === 0) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
		this.useSettings(ev.payload.settings);
		await this.tick();
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		streamDeck.logger.info("Key pressed: opening Outlook");
		try {
			streamDeck.logger.info(`Outlook: ${await focusOrLaunchOutlook()}`);
		} catch (err) {
			streamDeck.logger.error(`Failed to open Outlook: ${err}`);
			await ev.action.showAlert();
		}
	}

	private useSettings(settings: Settings): void {
		const url = settings.icsUrl?.trim() || undefined;
		if (url !== this.icsUrl) {
			this.icsUrl = url;
			this.fetchedAt = 0;
		}
	}

	private async tick(): Promise<void> {
		const now = Date.now();
		if (this.icsUrl && now - this.fetchedAt > REFRESH_MS) {
			this.fetchedAt = now;
			try {
				this.meeting = await fetchNextMeeting(this.icsUrl);
				this.error = undefined;
			} catch (err) {
				this.error = String(err);
				streamDeck.logger.error(`Calendar fetch failed: ${this.error}`);
			}
		}
		if (this.meeting && this.meeting.start.getTime() <= now) {
			this.fetchedAt = 0;
		}

		const image = this.face(now);
		for (const a of this.actions) {
			if (a.isKey() && this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await (a as KeyAction<Settings>).setImage(image);
			}
		}
	}

	private face(now: number): string {
		if (!this.icsUrl) {
			return svgKey({ background: "#333", lines: [{ text: "Configure", size: 20 }, { text: "o link ICS", size: 20 }] });
		}
		if (this.error && !this.meeting) {
			return svgKey({ background: "#5a1d1d", lines: [{ text: "Agenda", size: 20 }, { text: "indisponível", size: 18 }] });
		}
		const m = this.meeting;
		if (!m || m.start.getTime() <= now) {
			return svgKey({ background: "#1e3a2f", lines: [{ text: "Sem reuniões", size: 18 }, { text: "nos próx. 7 dias", size: 16, color: "#9fc" }] });
		}

		const msLeft = m.start.getTime() - now;
		const soon = msLeft <= ALERT_MS;
		const blinkOn = Math.floor(now / 500) % 2 === 0;
		const background = soon ? (blinkOn ? "#e53935" : "#4a0d0d") : "#1b2b45";
		return svgKey({
			background,
			lines: [
				{ text: when(m.start, now), size: 18, color: soon ? "#fff" : "#9cf" },
				{ text: time(m.start), size: 34, bold: true },
				{ text: countdown(msLeft), size: 18 },
				{ text: fit(m.title, 13), size: 16, color: "#ddd" },
			],
		});
	}
}

function time(d: Date): string {
	return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function when(d: Date, now: number): string {
	const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
	const diff = Math.round((day(d) - day(new Date(now))) / 86_400_000);
	if (diff === 0) return "Hoje";
	if (diff === 1) return "Amanhã";
	return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }).replace(".", "");
}

function countdown(ms: number): string {
	const min = Math.ceil(ms / 60_000);
	if (min < 60) return `em ${min} min`;
	const h = Math.floor(min / 60);
	if (h < 24) return `em ${h}h${String(min % 60).padStart(2, "0")}`;
	return `em ${Math.floor(h / 24)}d ${h % 24}h`;
}
