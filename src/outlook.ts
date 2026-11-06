import { spawn } from "node:child_process";

const OUTLOOK_APP_ID = "Microsoft.OutlookForWindows_8wekyb3d8bbwe!Microsoft.OutlookforWindows";

// Windows only lets the foreground app steal focus; a synthetic Alt tap lifts that lock for background callers.
const FOCUS_OR_LAUNCH = `
$all = @(Get-Process olk -ErrorAction SilentlyContinue)
$p = $all | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { "launch (olk processes: $($all.Count))"; Start-Process explorer.exe 'shell:AppsFolder\\${OUTLOOK_APP_ID}'; exit }
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class W {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
}
'@
$h = $p.MainWindowHandle
if ([W]::IsIconic($h)) { [W]::ShowWindow($h, 9) | Out-Null }
[W]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [W]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
"focus pid=$($p.Id) title='$($p.MainWindowTitle)' result=$([W]::SetForegroundWindow($h))"
`;

export function focusOrLaunchOutlook(): Promise<string> {
	const encoded = Buffer.from(FOCUS_OR_LAUNCH, "utf16le").toString("base64");
	return new Promise((resolve, reject) => {
		const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encoded], {
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		let out = "";
		ps.stdout.on("data", (d) => (out += d));
		ps.stderr.on("data", (d) => (out += d));
		ps.on("error", reject);
		ps.on("exit", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`powershell exited ${code}: ${out.trim()}`))));
	});
}
