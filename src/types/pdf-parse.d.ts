declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(
    data: Buffer | Uint8Array,
    options?: unknown,
  ): Promise<{ text: string; numpages: number; info?: unknown }>;
  export default pdfParse;
}
