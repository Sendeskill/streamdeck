import ical from "node-ical";

const url = process.argv[2];
const res = await fetch(url);
console.log("HTTP", res.status, res.headers.get("content-type"));
const text = await res.text();
console.log("bytes", text.length);
const data = ical.sync.parseICS(text);
const events = Object.values(data).filter((e) => e.type === "VEVENT");
console.log("VEVENTs", events.length, "recurring", events.filter((e) => e.rrule).length);
const sample = events.find((e) => e.rrule);
if (sample) {
  console.log("sample keys", Object.keys(sample));
  console.log("rrule type", typeof sample.rrule, Object.getOwnPropertyNames(Object.getPrototypeOf(sample.rrule)));
  console.log("start", sample.start, sample.start?.tz, "busy", sample["MICROSOFT-CDO-BUSYSTATUS"], sample.transparency);
}
console.log("expand helper", typeof ical.expandRecurringEvent);
