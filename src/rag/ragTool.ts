// rag/ragTool.ts
// RAG tool for VoltAgent integration

import { Tool } from "@voltagent/core";
import { ragStorage } from "./storage";
import { z } from "zod";

export const ragSearchTool = new Tool({
  name: "rag_search",
  description: "Search the knowledge base using semantic similarity. Use this when the user asks questions that might be answered by stored documents, manuals, guides, or previous documentation.",
  
  parameters: z.object({
    query: z.string().describe("The search query to find relevant information"),
    topK: z.number().optional().default(5).describe("Number of results to return (default: 5)"),
  }),

  execute: async ({ query, topK = 5 }, context) => {
    try {
      console.log(`🔍 RAG Search: "${query}"`);

      const results = await ragStorage.search(
        query,
        topK,
        context?.userId,
        context?.conversationId
      );

      if (results.length === 0) {
        return {
          success: false,
          message: "No relevant information found in the knowledge base.",
          results: [],
        };
      }

      // Format results for the agent
      const formattedResults = results.map((r, idx) => ({
        rank: idx + 1,
        similarity: r.similarity.toFixed(3),
        source: r.document.title,
        content: r.chunk.chunkText,
        metadata: r.chunk.metadata,
      }));

      console.log(`✅ Found ${results.length} relevant chunks`);

      return {
        success: true,
        message: `Found ${results.length} relevant results`,
        results: formattedResults,
        context: formattedResults.map(r => r.content).join('\n\n---\n\n'),
      };
    } catch (error: any) {
      console.error("❌ RAG search failed:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },
});