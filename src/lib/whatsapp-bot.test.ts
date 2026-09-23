import { describe, expect, it } from "vitest";

import { buttonsFor, parseIntent } from "./whatsapp-bot";

describe("whatsapp parseIntent", () => {
  it("maps button replies to actions", () => {
    expect(parseIntent({ type: "interactive", interactive: { button_reply: { id: "entry" } } })).toEqual({
      kind: "action",
      action: "entry",
    });
    expect(parseIntent({ type: "interactive", interactive: { button_reply: { id: "no_recall" } } })).toEqual({
      kind: "no_recall",
    });
  });
  it("parses link secrets (4-digit PIN or 6-digit code)", () => {
    expect(parseIntent({ type: "text", text: { body: "1234" } })).toEqual({ kind: "link", secret: "1234" });
    expect(parseIntent({ type: "text", text: { body: "vincular 123456" } })).toEqual({ kind: "link", secret: "123456" });
  });
  it("parses reported times and text commands", () => {
    expect(parseIntent({ type: "text", text: { body: "9:05" } })).toEqual({ kind: "reported_time", time: "09:05" });
    expect(parseIntent({ type: "text", text: { body: "Salir" } })).toEqual({ kind: "action", action: "exit" });
    expect(parseIntent({ type: "text", text: { body: "hola" } })).toEqual({ kind: "menu" });
  });
  it("parses location picker replies", () => {
    expect(parseIntent({ type: "interactive", interactive: { button_reply: { id: "loc:entry:abc" } } })).toEqual({
      kind: "location",
      action: "entry",
      locationId: "abc",
    });
  });
});

describe("whatsapp buttonsFor", () => {
  it("never exceeds Meta's 3-button limit and follows state", () => {
    expect(buttonsFor("out", true).map((b) => b.id)).toEqual(["entry", "status"]);
    expect(buttonsFor("working", true).map((b) => b.id)).toEqual(["exit", "break_start", "status"]);
    expect(buttonsFor("working", false).map((b) => b.id)).toEqual(["exit", "status"]);
    expect(buttonsFor("break", true).map((b) => b.id)).toEqual(["break_end", "status"]);
  });
});

import { inboundKind, marketOf, minimalMessagePayload } from "./whatsapp-telemetry";

describe("whatsapp telemetry", () => {
  it("classifies intents", () => {
    expect(inboundKind({ kind: "link", secret: "1234" })).toBe("linkage");
    expect(inboundKind({ kind: "action", action: "entry" })).toBe("clock_action");
    expect(inboundKind({ kind: "action", action: "break_end" })).toBe("break_action");
    expect(inboundKind({ kind: "action", action: "status" })).toBe("status");
    expect(inboundKind({ kind: "menu" })).toBe("menu");
  });
  it("derives market", () => {
    expect(marketOf("+34 600 000 000")).toBe("ES");
    expect(marketOf("351912345678")).toBe("PT");
    expect(marketOf("999")).toBe("OTHER");
  });
  it("never keeps message bodies (PINs)", () => {
    const p = minimalMessagePayload({ id: "x", type: "text", text: { body: "2580" } });
    expect(JSON.stringify(p)).not.toContain("2580");
  });
});
