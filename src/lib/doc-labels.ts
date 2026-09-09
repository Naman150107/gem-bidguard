import {
  DocumentType,
  GovSource,
  type DocumentType as DocumentTypeT,
  type GovSource as GovSourceT,
} from "./types";

/** Human-readable labels for document types. */
export const DOC_TYPE_LABEL: Record<DocumentTypeT, string> = {
  [DocumentType.GST_CERTIFICATE]: "GST Certificate",
  [DocumentType.PAN_CARD]: "PAN Card",
  [DocumentType.UDYAM_CERTIFICATE]: "Udyam Certificate",
  [DocumentType.ITR]: "Income Tax Return",
  [DocumentType.OEM_AUTHORIZATION]: "OEM Authorization",
  [DocumentType.LOCAL_CONTENT_DECLARATION]: "Local Content Declaration",
  [DocumentType.EPFO]: "EPFO Registration",
  [DocumentType.ESIC]: "ESIC Registration",
  [DocumentType.STARTUP_CERT]: "Startup India Certificate",
  [DocumentType.NSIC_CERT]: "NSIC Certificate",
  [DocumentType.BID_DECLARATION]: "Bid Declaration",
};

export function humanizeDocType(type: string): string {
  return (
    DOC_TYPE_LABEL[type as DocumentTypeT] ??
    type.replace(/_/g, " ").toLowerCase()
  );
}

/** Human-readable labels for government sources. */
export const GOV_SOURCE_LABEL: Record<GovSourceT, string> = {
  [GovSource.GST]: "GST (GSTN)",
  [GovSource.PAN]: "PAN (Income Tax)",
  [GovSource.UDYAM]: "Udyam / MSME",
  [GovSource.MCA]: "MCA (Corporate Affairs)",
  [GovSource.EPFO]: "EPFO",
  [GovSource.ESIC]: "ESIC",
  [GovSource.STARTUP_INDIA]: "Startup India",
  [GovSource.NSIC]: "NSIC",
  [GovSource.DEBARMENT]: "Debarment / Blacklist",
};

export function humanizeGovSource(source: string): string {
  return (
    GOV_SOURCE_LABEL[source as GovSourceT] ??
    source.replace(/_/g, " ")
  );
}
