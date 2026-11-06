import streamDeck from "@elgato/streamdeck";
import { spawn, type ChildProcess } from "node:child_process";

export type CursorPos = { x: number; y: number; left: number; top: number; width: number; height: number };

// Prints "x y vx vy vw vh" (cursor + virtual screen bounds) whenever it changes.
const TRACKER = `
$ErrorActionPreference = 'Stop'
Add-Type -Namespace SendeskillDeck -Name Mouse -MemberDefinition '
[StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
[DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
[DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
'
[void][SendeskillDeck.Mouse]::SetProcessDPIAware()
$prev = ''
while ($true) {
  $p = New-Object SendeskillDeck.Mouse+POINT
  if ([SendeskillDeck.Mouse]::GetCursorPos([ref]$p)) {
    $m = [SendeskillDeck.Mouse]
    $line = "$($p.X) $($p.Y) $($m::GetSystemMetrics(76)) $($m::GetSystemMetrics(77)) $($m::GetSystemMetrics(78)) $($m::GetSystemMetrics(79))"
    if ($line -ne $prev) { [Console]::Out.WriteLine($line); [Console]::Out.Flush(); $prev = $line }
  }
  Start-Sleep -Milliseconds 40
}
`;

class CursorTracker {
	pos?: CursorPos;
	lastMove = Date.now();
	private proc?: ChildProcess;
	private users = 0;
	private retry?: NodeJS.Timeout;

	acquire(): void {
		if (this.users++ === 0) this.start();
	}

	release(): void {
		this.users = Math.max(0, this.users - 1);
		if (this.users === 0) this.stop();
	}

	private start(): void {
		const encoded = Buffer.from(TRACKER, "utf16le").toString("base64");
		const proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encoded], {
			stdio: ["ignore", "pipe", "ignore"],
			windowsHide: true,
		});
		this.proc = proc;
		let buf = "";
		proc.stdout?.on("data", (d) => {
			buf += d;
			let nl;
			while ((nl = buf.indexOf("\n")) >= 0) {
				this.parse(buf.slice(0, nl));
				buf = buf.slice(nl + 1);
			}
		});
		proc.on("error", (err) => streamDeck.logger.error(`Cursor tracker failed: ${err}`));
		proc.on("exit", () => {
			if (this.proc !== proc) return;
			this.proc = undefined;
			if (this.users > 0) this.retry = setTimeout(() => this.start(), 2000);
		});
	}

	private stop(): void {
		clearTimeout(this.retry);
		const proc = this.proc;
		this.proc = undefined;
		proc?.kill();
	}

	private parse(line: string): void {
		const [x, y, left, top, width, height] = line.trim().split(" ").map(Number);
		if (![x, y, left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
		if (this.pos && (this.pos.x !== x || this.pos.y !== y)) this.lastMove = Date.now();
		this.pos = { x, y, left, top, width, height };
	}

	dispose(): void {
		this.users = 0;
		this.stop();
	}
}

export const cursor = new CursorTracker();
process.on("exit", () => cursor.dispose());
