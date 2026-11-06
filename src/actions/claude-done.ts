import { action, SingletonAction, type KeyAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import path from "node:path";
import { claudeState } from "../claude-state";
import { fit, svgKey } from "../render";

@action({ UUID: "com.sendeskill.devdeck.claude-done" })
export class ClaudeDone extends SingletonAction {
	private unsubscribe?: () => void;
	private timer?: NodeJS.Timeout;
	private lastImage = new Map<string, string>();

	override async onWillAppear(_ev: WillAppearEvent): Promise<void> {
		this.unsubscribe ??= claudeState.subscribe(() => void this.render());
		this.timer ??= setInterval(() => void this.render(), 500);
		await this.render();
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.lastImage.delete(ev.action.id);
		if ([...this.actions].length === 0) {
			this.unsubscribe?.();
			this.unsubscribe = undefined;
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	override onKeyDown(): void {
		claudeState.acknowledge();
	}

	private async render(): Promise<void> {
		const image = this.face();
		for (const a of this.actions) {
			if (a.isKey() && this.lastImage.get(a.id) !== image) {
				this.lastImage.set(a.id, image);
				await (a as KeyAction<JsonObject>).setImage(image);
			}
		}
	}

	private face(): string {
		const s = claudeState.current;
		if (s.state !== "done") {
			return svgKey({
				background: "#1f1f1f",
				lines: [
					{ text: "Claude", size: 22, bold: true, color: "#d97757" },
					{ text: s.state === "running" ? "trabalhando" : "aguardando", size: 16, color: "#aaa" },
				],
			});
		}
		const on = Math.floor(Date.now() / 500) % 2 === 0;
		return svgKey({
			background: on ? "#d97757" : "#3a1f14",
			lines: [
				{ text: "Claude", size: 22, bold: true },
				{ text: "terminou!", size: 20 },
				{ text: fit(path.basename(s.cwd), 14), size: 15, color: "#ffe" },
			],
		});
	}
}
