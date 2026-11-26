import { expect, it } from "vitest";
import handler from "../api/index.mjs";

it("serves the real catalog and geometry through the Vercel entry point", async () => {
  const catalog = await handler.fetch(new Request("https://sakaygo.example/api/catalog"));
  expect(catalog.status).toBe(200);
  expect((await catalog.json()).routes).toHaveLength(76);
  const detail = await handler.fetch(new Request("https://sakaygo.example/api/catalog/1"));
  expect(detail.status).toBe(200);
  expect((await detail.json()).geometry).toBeTruthy();
});

it("does not accept spoofed owner identity on Vercel", async () => {
  const headers = {"oai-authenticated-user-id":"owner","oai-authenticated-user-email":"local@localhost"};
  const session = await handler.fetch(new Request("https://sakaygo.example/api/session", {headers}));
  expect(await session.json()).toEqual({admin:false,signedIn:false});
  const admin = await handler.fetch(new Request("https://sakaygo.example/api/admin/state", {headers}));
  expect(admin.status).toBe(403);
});
