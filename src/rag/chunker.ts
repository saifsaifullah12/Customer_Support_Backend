// rag/chunker.ts
// Text chunking service for RAG

import { RAG_CONFIG } from "./config";

export interface TextChunk {
  text: string;
  index: number;
  metadata?: Record<string, any>;
}

export class TextChunker {
  /**
   * Split text into overlapping chunks
   */
  chunkText(text: string, metadata?: Record<string, any>): TextChunk[] {
    const { chunkSize, chunkOverlap, minChunkSize } = RAG_CONFIG.chunking;
    const chunks: TextChunk[] = [];

    // Clean and normalize text
    const cleanedText = this.cleanText(text);

    if (cleanedText.length < minChunkSize) {
      return [{
        text: cleanedText,
        index: 0,
        metadata,
      }];
    }

    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < cleanedText.length) {
      const endIndex = Math.min(startIndex + chunkSize, cleanedText.length);
      let chunkText = cleanedText.substring(startIndex, endIndex);

      // Try to break at sentence boundary
      if (endIndex < cleanedText.length) {
        const lastPeriod = chunkText.lastIndexOf('. ');
        const lastNewline = chunkText.lastIndexOf('\n');
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > chunkSize * 0.5) {
          chunkText = chunkText.substring(0, breakPoint + 1);
        }
      }

      if (chunkText.trim().length >= minChunkSize) {
        chunks.push({
          text: chunkText.trim(),
          index: chunkIndex++,
          metadata: {
            ...metadata,
            startChar: startIndex,
            endChar: startIndex + chunkText.length,
          },
        });
      }

      // Ensure we always move forward to prevent infinite loops
      const step = Math.max(1, chunkText.length - chunkOverlap);
      startIndex += step;
    }

    return chunks;
  }

  /**
   * Split by paragraphs (alternative chunking strategy)
   */
  chunkByParagraphs(text: string, maxChunkSize: number = 1000): TextChunk[] {
    const paragraphs = text.split(/\n\n+/);
    const chunks: TextChunk[] = [];
    let currentChunk = '';
    let chunkIndex = 0;

    for (const para of paragraphs) {
      const cleanPara = para.trim();

      if (!cleanPara) continue;

      if (currentChunk.length + cleanPara.length > maxChunkSize && currentChunk) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex++,
        });
        currentChunk = cleanPara;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + cleanPara;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex,
      });
    }

    return chunks;
  }

  /**
   * Clean and normalize text
   */
  private cleanText(text: string): string {
    // Force string conversion to prevent "text.replace is not a function" errors
    const safeText = String(text || "");

    return safeText
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[ ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Extract metadata from text
   */
  extractMetadata(text: string): Record<string, any> {
    const metadata: Record<string, any> = {
      charCount: text.length,
      wordCount: text.split(/\s+/).length,
      paragraphCount: text.split(/\n\n+/).length,
    };

    // Extract potential title (first line if short)
    const firstLine = text.split('\n')[0];
    if (firstLine.length < 100) {
      metadata.potentialTitle = firstLine.trim();
    }

    return metadata;
  }
}

export const textChunker = new TextChunker();