declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
    [key: string]: any; // for flexibility
  }

  type PdfParseFunctionType = (dataBuffer: Buffer, options?: any) => Promise<PDFData>;

  const pdfParse: PdfParseFunctionType;
  export default pdfParse;
} 