import streamDeck from "@elgato/streamdeck";
import { ClaudeDone } from "./actions/claude-done";
import { NextMeeting } from "./actions/next-meeting";

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new NextMeeting());
streamDeck.actions.registerAction(new ClaudeDone());
streamDeck.connect();
