import type { Context } from "hono";
import { documentProcessor } from "../rag/processor";
import { RAG_CONFIG } from "../rag/config";

export async function uploadRoute(c: Context) {
  try {
    const body = await c.req.parseBody();
    const file = body.file as File;

    if (!file) {
      return c.json({ ok: false, error: "No file uploaded" }, 400);
    }

    const fileType = file.type;
    console.log(`📤 Upload received: ${file.name} (${fileType})`);

    // 1. Handle Images (Existing Loop)
    if (fileType.startsWith("image/")) {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");

      return c.json({
        ok: true,
        fileName: file.name,
        fileType: fileType,
        isImage: true,
        isDocument: false,
        imageBase64: base64
      });
    }

    // 2. Handle Documents (New Feature)
    if (RAG_CONFIG.supportedFileTypes.includes(fileType)) {
      try {
        const { text, metadata } = await documentProcessor.processFile(file);

        return c.json({
          ok: true,
          fileName: file.name,
          fileType: fileType,
          isImage: false,
          isDocument: true,
          text: text,
          metadata: metadata
        });
      } catch (docError: any) {
        console.error("❌ Document processing failed:", docError);
        return c.json({
          ok: false,
          error: `Failed to process document: ${docError.message}`,
          isDocument: true
        }, 400);
      }
    }

    // 3. Unsupported Type
    return c.json({
      ok: false,
      error: `Unsupported file type: ${fileType}. Supported types: Images, PDF, DOCX, TXT, CSV, JSON`,
    }, 400);

  } catch (err: any) {
    console.error("❌ Upload Route Error:", err);
    return c.json({ ok: false, error: "Upload Failed", details: err.message }, 500);
  }
}
