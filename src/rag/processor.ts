// rag/processor.ts
// Document processing for different file types using unpdf

import mammoth from "mammoth";
import { extractText } from "unpdf";

export class DocumentProcessor {
  /**
   * Process uploaded file and extract text
   */
  async processFile(file: File): Promise<{ text: string; metadata: Record<string, any> }> {
    if (!file || !file.name) {
      throw new Error("Invalid file object");
    }

    const fileType = file.type || 'application/octet-stream';
    const fileName = file.name;

    console.log(`📄 Processing file: ${fileName} (${fileType})`);

    try {
      switch (fileType) {
        case 'text/plain':
        case 'text/markdown':
          return this.processText(file);

        case 'application/pdf':
          return this.processPDF(file);

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          return this.processDOCX(file);

        case 'text/csv':
          return this.processCSV(file);

        case 'application/json':
          return this.processJSON(file);

        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error: any) {
      console.error(`❌ File processing failed for ${fileName}:`, error);
      throw error;
    }
  }

  /**
   * Process plain text file
   */
  private async processText(file: File): Promise<{ text: string; metadata: Record<string, any> }> {
    const text = await file.text();
    return {
      text: String(text || ""),
      metadata: {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      },
    };
  }

  /**
   * Process PDF file using unpdf
   */
  private async processPDF(file: File): Promise<{ text: string; metadata: Record<string, any> }> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const result = await extractText(uint8Array);
      const text = result?.text;
      const totalPages = result?.totalPages;

      return {
        text: String(text || "").trim(),
        metadata: {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          pageCount: totalPages || 0,
        },
      };
    } catch (error: any) {
      console.error("❌ PDF processing failed:", error.message);
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  /**
   * Process DOCX file
   */
  private async processDOCX(file: File): Promise<{ text: string; metadata: Record<string, any> }> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await mammoth.extractRawText({ buffer });

      return {
        text: result.value,
        metadata: {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        },
      };
    } catch (error: any) {
      throw new Error(`DOCX processing failed: ${error.message}`);
    }
  }

  /**
   * Process CSV file
   */
  private async processCSV(file: File): Promise<{ text: string; metadata: Record<string, any> }> {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    const headers = lines[0]?.split(',') || [];

    return {
      text,
      metadata: {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        rowCount: lines.length - 1,
        columnCount: headers.length,
        headers,
      },
    };
  }

  /**
   * Process JSON file
   */
  private async processJSON(file: File): Promise<{ text: string; metadata: Record<string, any> }> {
    const text = await file.text();
    const json = JSON.parse(text);

    // Convert JSON to readable text
    const readableText = JSON.stringify(json, null, 2);

    return {
      text: readableText,
      metadata: {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        keys: Object.keys(json),
      },
    };
  }

  /**
   * Process base64 encoded file
   */
  async processBase64(
    base64Data: string,
    fileName: string,
    mimeType: string
  ): Promise<{ text: string; metadata: Record<string, any> }> {
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Create a File-like object
    const blob = new Blob([buffer], { type: mimeType });
    const file = new File([blob], fileName, { type: mimeType });

    return this.processFile(file);
  }
}

export const documentProcessor = new DocumentProcessor();