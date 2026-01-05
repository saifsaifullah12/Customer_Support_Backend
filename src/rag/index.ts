// rag/index.ts
// Main RAG module exports

export { RAG_CONFIG } from "./config";
export { EmbeddingService, embeddingService } from "./embeddings";
export { TextChunker, textChunker } from "./chunker";
export { RAGStorage, ragStorage } from "./storage";
export { DocumentProcessor, documentProcessor } from "./processor";
export { ragSearchTool } from "./ragTool";
export type { Document, Chunk, SearchResult } from "./storage";
export type { TextChunk } from "./chunker";