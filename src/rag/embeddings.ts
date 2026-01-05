import OpenAI from "openai";
import { RAG_CONFIG } from "./config";

export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export class EmbeddingService {
  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (!openrouter || !openrouter.embeddings) {
        throw new Error("OpenAI/OpenRouter client not properly initialized. Check API keys.");
      }

      const response = await openrouter.embeddings.create({
        model: RAG_CONFIG.embedding.model,
        input: text.substring(0, 8000),
      });

      return response.data[0].embedding;
    } catch (error: any) {
      console.error("❌ Embedding generation failed:", error.message);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batches
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    const batchSize = RAG_CONFIG.embedding.batchSize;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      try {
        const response = await openrouter.embeddings.create({
          model: RAG_CONFIG.embedding.model,
          input: batch.map(t => t.substring(0, 8000)),
        });

        embeddings.push(...response.data.map((d: any) => d.embedding));
      } catch (error: any) {
        console.error(`❌ Batch ${i / batchSize + 1} failed:`, error.message);
        throw error;
      }
    }

    return embeddings;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const embeddingService = new EmbeddingService();