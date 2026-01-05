// rag/routes/ragRoutes.ts
// API routes for RAG operations

import type { Context } from "hono";
import { ragStorage } from "../storage";
import { documentProcessor } from "../processor";
import { RAG_CONFIG } from "../config";

/**
 * Upload and index a document
 */
export async function uploadDocumentRoute(c: Context) {
  try {
    const body = await c.req.parseBody();
    const file = body.file as File;

    // Strict validation for file object
    if (!file || typeof file !== 'object' || !file.name) {
      return c.json({ ok: false, error: "No valid file provided" }, 400);
    }

    const title = (body.title as string) || file.name;
    const source = (body.source as string) || "upload";

    // Validate file type
    if (!RAG_CONFIG.supportedFileTypes.includes(file.type)) {
      return c.json({
        ok: false,
        error: `Unsupported file type: ${file.type}`,
        supportedTypes: RAG_CONFIG.supportedFileTypes,
      }, 400);
    }

    // Validate file size
    if (file.size > RAG_CONFIG.maxFileSize) {
      return c.json({
        ok: false,
        error: `File too large. Max size: ${RAG_CONFIG.maxFileSize / (1024 * 1024)}MB`,
      }, 400);
    }

    console.log(`📤 Processing document: ${title}`);

    // Process the file
    const { text, metadata } = await documentProcessor.processFile(file);

    if (!text || text.trim().length === 0) {
      return c.json({
        ok: false,
        error: "No text could be extracted from the file. If this is a PDF, ensure it contains selectable text, not just images.",
      }, 400);
    }

    // Add to RAG storage
    const documentId = await ragStorage.addDocument(
      title,
      text,
      { ...metadata, uploadedBy: body.userId },
      source
    );

    return c.json({
      ok: true,
      message: "Document uploaded and indexed successfully",
      documentId,
      metadata,
    });
  } catch (error: any) {
    console.error("❌ Document upload failed:", error);
    return c.json({
      ok: false,
      error: error.message,
    }, 500);
  }
}

/**
 * Search documents
 */
export async function searchDocumentsRoute(c: Context) {
  try {
    const { query, topK = 5 } = await c.req.json();

    if (!query) {
      return c.json({ ok: false, error: "Query is required" }, 400);
    }

    const userId = c.req.header("X-User-Id");
    const conversationId = c.req.header("X-Conversation-Id");

    const results = await ragStorage.search(query, topK, userId, conversationId);

    return c.json({
      ok: true,
      query,
      resultsCount: results.length,
      results: results.map(r => ({
        documentId: r.document.id,
        documentTitle: r.document.title,
        chunkText: r.chunk.chunkText,
        similarity: r.similarity,
        source: r.document.source,
      })),
    });
  } catch (error: any) {
    console.error("❌ Search failed:", error);
    return c.json({
      ok: false,
      error: error.message,
    }, 500);
  }
}

/**
 * Get all documents
 */
export async function getAllDocumentsRoute(c: Context) {
  try {
    const documents = await ragStorage.getAllDocuments();

    return c.json({
      ok: true,
      count: documents.length,
      documents: documents.map(d => ({
        id: d.id,
        title: d.title,
        source: d.source,
        metadata: d.metadata,
        createdAt: d.createdAt,
        preview: d.content.substring(0, 200) + '...',
      })),
    });
  } catch (error: any) {
    console.error("❌ Failed to get documents:", error);
    return c.json({
      ok: false,
      error: error.message,
    }, 500);
  }
}

/**
 * Get document by ID
 */
export async function getDocumentRoute(c: Context) {
  try {
    const documentId = c.req.param("id");
    const document = await ragStorage.getDocument(documentId);

    if (!document) {
      return c.json({
        ok: false,
        error: "Document not found",
      }, 404);
    }

    return c.json({
      ok: true,
      document,
    });
  } catch (error: any) {
    console.error("❌ Failed to get document:", error);
    return c.json({
      ok: false,
      error: error.message,
    }, 500);
  }
}

/**
 * Delete document
 */
export async function deleteDocumentRoute(c: Context) {
  try {
    const documentId = c.req.param("id");
    const success = await ragStorage.deleteDocument(documentId);

    if (!success) {
      return c.json({
        ok: false,
        error: "Failed to delete document",
      }, 500);
    }

    return c.json({
      ok: true,
      message: "Document deleted successfully",
      documentId,
    });
  } catch (error: any) {
    console.error("❌ Failed to delete document:", error);
    return c.json({
      ok: false,
      error: error.message,
    }, 500);
  }
}

/**
 * Get RAG statistics
 */
export async function getStatsRoute(c: Context) {
  try {
    const stats = await ragStorage.getStats();

    return c.json({
      ok: true,
      stats,
    });
  } catch (error: any) {
    console.error("❌ Failed to get stats:", error);
    return c.json({
      ok: false,
      error: error.message,
    }, 500);
  }
}

/**
 * Batch upload text documents
 */
export async function batchUploadRoute(c: Context) {
  try {
    const { documents } = await c.req.json();

    if (!Array.isArray(documents) || documents.length === 0) {
      return c.json({
        ok: false,
        error: "Documents array is required",
      }, 400);
    }

    const results = [];

    for (const doc of documents) {
      try {
        const documentId = await ragStorage.addDocument(
          doc.title,
          doc.content,
          doc.metadata,
          doc.source || "batch-upload"
        );

        results.push({
          title: doc.title,
          documentId,
          success: true,
        });
      } catch (error: any) {
        results.push({
          title: doc.title,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return c.json({
      ok: true,
      message: `Batch upload completed: ${successCount}/${documents.length} successful`,
      results,
    });
  } catch (error: any) {
    console.error("❌ Batch upload failed:", error);
    return c.json({
      ok: false,
      error: error.message,
    }, 500);
  }
}