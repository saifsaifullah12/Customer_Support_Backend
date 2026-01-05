// rag/storage.ts
// RAG storage operations with PostgreSQL + pgvector

import { query } from "../db/client";
import { embeddingService } from "./embeddings";
import { textChunker, type TextChunk } from "./chunker";
import { RAG_CONFIG } from "./config";

export interface Document {
  id: string;
  title: string;
  content: string;
  metadata?: Record<string, any>;
  source?: string;
  createdAt: Date;
}

export interface Chunk {
  id: string;
  documentId: string;
  chunkText: string;
  chunkIndex: number;
  embedding?: number[];
  metadata?: Record<string, any>;
}

export interface SearchResult {
  chunk: Chunk;
  document: Document;
  similarity: number;
}

export class RAGStorage {
  /**
   * Add a document to the RAG system
   */
  async addDocument(
    title: string,
    content: string,
    metadata?: Record<string, any>,
    source?: string
  ): Promise<string> {
    try {
      // Insert document
      const docResult = await query(
        `INSERT INTO rag_documents (title, content, metadata, source)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [title, content, JSON.stringify(metadata || {}), source]
      );

      const documentId = docResult[0].id;

      // Chunk the document
      const chunks = textChunker.chunkText(content, metadata);

      // Generate embeddings and store chunks
      await this.addChunks(documentId, chunks);

      console.log(`✅ Document added: ${title} (${chunks.length} chunks)`);
      return documentId;
    } catch (error: any) {
      console.error("❌ Failed to add document:", error);
      throw error;
    }
  }

  /**
   * Add chunks with embeddings for a document
   */
  private async addChunks(documentId: string, chunks: TextChunk[]): Promise<void> {
    const texts = chunks.map(c => c.text);
    const embeddings = await embeddingService.generateEmbeddingsBatch(texts);

    for (let i = 0; i < chunks.length; i++) {
      await query(
        `INSERT INTO rag_chunks (document_id, chunk_text, chunk_index, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          documentId,
          chunks[i].text,
          chunks[i].index,
          JSON.stringify(embeddings[i]),
          JSON.stringify(chunks[i].metadata || {}),
        ]
      );
    }
  }

  /**
   * Search for relevant chunks using semantic similarity
   */
  async search(
    queryText: string,
    topK: number = RAG_CONFIG.retrieval.topK,
    userId?: string,
    conversationId?: string
  ): Promise<SearchResult[]> {
    try {
      // Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(queryText);

      // Perform vector similarity search
      const results = await query(
        `SELECT 
          c.id,
          c.document_id,
          c.chunk_text,
          c.chunk_index,
          c.metadata as chunk_metadata,
          d.title,
          d.content,
          d.metadata as doc_metadata,
          d.source,
          d.created_at,
          1 - (c.embedding <=> $1::vector) as similarity
         FROM rag_chunks c
         JOIN rag_documents d ON c.document_id = d.id
         WHERE 1 - (c.embedding <=> $1::vector) > $2
         ORDER BY c.embedding <=> $1::vector
         LIMIT $3`,
        [JSON.stringify(queryEmbedding), RAG_CONFIG.retrieval.similarityThreshold, topK]
      );

      // Log the query
      await this.logQuery(queryText, results.length, results, userId, conversationId);

      return results.map(r => ({
        chunk: {
          id: r.id,
          documentId: r.document_id,
          chunkText: r.chunk_text,
          chunkIndex: r.chunk_index,
          metadata: r.chunk_metadata,
        },
        document: {
          id: r.document_id,
          title: r.title,
          content: r.content,
          metadata: r.doc_metadata,
          source: r.source,
          createdAt: r.created_at,
        },
        similarity: parseFloat(r.similarity),
      }));
    } catch (error: any) {
      console.error("❌ Search failed:", error);
      throw error;
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId: string): Promise<Document | null> {
    const results = await query(
      `SELECT id, title, content, metadata, source, created_at
       FROM rag_documents
       WHERE id = $1`,
      [documentId]
    );

    if (results.length === 0) return null;

    const r = results[0];
    return {
      id: r.id,
      title: r.title,
      content: r.content,
      metadata: r.metadata,
      source: r.source,
      createdAt: r.created_at,
    };
  }

  /**
   * Get all documents
   */
  async getAllDocuments(): Promise<Document[]> {
    const results = await query(
      `SELECT id, title, content, metadata, source, created_at
       FROM rag_documents
       ORDER BY created_at DESC`
    );

    return results.map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      metadata: r.metadata,
      source: r.source,
      createdAt: r.created_at,
    }));
  }

  /**
   * Delete document and its chunks
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    try {
      await query(`DELETE FROM rag_documents WHERE id = $1`, [documentId]);
      console.log(`✅ Document deleted: ${documentId}`);
      return true;
    } catch (error: any) {
      console.error("❌ Failed to delete document:", error);
      return false;
    }
  }

  /**
   * Log RAG query for analytics
   */
  private async logQuery(
    queryText: string,
    resultsCount: number,
    chunks: any[],
    userId?: string,
    conversationId?: string
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO rag_queries (query_text, results_count, chunks_retrieved, user_id, conversation_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          queryText,
          resultsCount,
          JSON.stringify(chunks.map(c => ({ id: c.id, similarity: c.similarity }))),
          userId,
          conversationId,
        ]
      );
    } catch (error) {
      console.error("Failed to log RAG query:", error);
    }
  }

  /**
   * Get RAG statistics
   */
  async getStats(): Promise<Record<string, any>> {
    const docCount = await query(`SELECT COUNT(*) as count FROM rag_documents`);
    const chunkCount = await query(`SELECT COUNT(*) as count FROM rag_chunks`);
    const queryCount = await query(`SELECT COUNT(*) as count FROM rag_queries`);

    return {
      documentCount: parseInt(docCount[0].count),
      chunkCount: parseInt(chunkCount[0].count),
      queryCount: parseInt(queryCount[0].count),
    };
  }
}

export const ragStorage = new RAGStorage();