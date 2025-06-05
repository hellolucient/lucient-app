declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    text: string;
    version: string;
    [key: string]: unknown;
  }

  type PdfParseOptions = Record<string, unknown>;

  type PdfParseFunctionType = (dataBuffer: Buffer, options?: PdfParseOptions) => Promise<PDFData>;

  const pdfParse: PdfParseFunctionType;
  export default pdfParse;
} 