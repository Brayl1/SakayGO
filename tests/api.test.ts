import { afterAll, beforeAll, it, expect } from "vitest";
import type { Server } from "node:http";
import { app } from "../server/index";
let server: Server, base: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
it("rejects retired demo journeys and unrecognized locations", async () => {
  const response = await fetch(`${base}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: "ustp", to: "divisoria", demo: true }),
  });
  expect(response.status).toBe(410);
  expect(await response.json()).not.toHaveProperty("journeys");
  const bad = await fetch(`${base}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: "unknown", to: "divisoria" }),
  });
  expect(bad.status).toBe(400);
});
it("does not silently fall back to demo for verified requests", async () => {
  const response = await fetch(`${base}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: "ustp", to: "divisoria" }),
  });
  expect((await response.json()).journeys).toEqual([]);
});
it("handles malformed JSON without exposing a stack trace", async () => {
  const response = await fetch(`${base}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{bad",
  });
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain("stack");
});
