import { fetchNextMeeting } from "../src/calendar.ts";

const m = await fetchNextMeeting(process.argv[2]);
console.log(m ? { start: m.start.toString(), end: m.end.toString(), title: m.title } : "none in 7 days");
