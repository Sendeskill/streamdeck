import { cursor } from "../src/cursor.ts";

cursor.acquire();
setTimeout(() => {
	console.log("cursor:", cursor.pos);
	cursor.release();
}, 2500);
