import streamDeck from "@elgato/streamdeck";
import { ClaudeDone } from "./actions/claude-done";
import { EyeAction } from "./actions/eye";
import { Miner } from "./actions/miner";
import { NextMeeting } from "./actions/next-meeting";

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new NextMeeting());
streamDeck.actions.registerAction(new ClaudeDone());
streamDeck.actions.registerAction(new EyeAction());
streamDeck.actions.registerAction(new Miner());
streamDeck.connect();
