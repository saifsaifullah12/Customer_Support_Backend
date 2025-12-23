// import { Readable } from "stream";
// import type { Context } from "hono";
// import { voiceProvider } from "../voice/index.js";

// export async function sttRoute(c: Context) {
//   const body = await c.req.raw.body;

//   if (!body) {
//     return c.json({ ok: false, error: "No audio received" }, 400);
//   }

//   const stream = Readable.from(body);
//   const text = await voiceProvider.listen(stream);

//   return c.json({
//     ok: true,
//     text
//   });
// }
