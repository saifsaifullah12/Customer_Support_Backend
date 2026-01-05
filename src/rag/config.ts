// rag/config.ts
// RAG Configuration for VoltAgent

export const RAG_CONFIG = {
  // Embedding configuration
  embedding: {
    model: "text-embedding-ada-002", 
    dimension: 1536,
    batchSize: 100,
  },

  // Chunking configuration
  chunking: {
    chunkSize: 1000, // characters per chunk
    chunkOverlap: 200, // overlap between chunks
    minChunkSize: 100,
  },

  // Retrieval configuration
  retrieval: {
    topK: 5, // number of chunks to retrieve
    similarityThreshold: 0.7, // minimum similarity score
    maxTokens: 4000, // max tokens for context
  },

  // Supported file types
  supportedFileTypes: [
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/csv',
    'application/json',
  ],

  // Maximum file size (10MB)
  maxFileSize: 10 * 1024 * 1024,
};