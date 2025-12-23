import type { Context } from "hono";

export async function uploadRoute(c: Context) {
  try {
    const body = await c.req.parseBody();
    const file = body.file as File;

    if (!file) {
      return c.json({ ok: false, error: "No file uploaded" }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return c.json({
      ok: true,
      fileName: file.name,
      imageBase64: base64
    });

  } catch (err) {
    console.error("❌ Upload Route Error:", err);
    return c.json({ ok: false, error: "Upload Failed" }, 500);
  }
}
