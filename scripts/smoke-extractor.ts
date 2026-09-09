import { seededExtractor } from "../src/server/ai/seeded-extractor";
import { demoBidders } from "../src/data/demo";

for (const b of demoBidders) {
  const p = await seededExtractor.extract(
    b.documents.map((d) => ({
      type: d.type,
      fileName: d.fileName,
      content: d.content,
      issueDate: d.issueDate,
      expiryDate: d.expiryDate,
    })),
  );
  console.log(
    `${b.key}: PAN=${p.declaredPan} GSTIN=${p.declaredGstin} turnover=${p.avgAnnualTurnoverCr}Cr local=${p.localContentPct}% orders=${p.similarOrders} emd=${p.emdPaidInr} debarredDecl=${p.declaredDebarred} oemUpto=${p.oemValidUpto} conf=${p.confidence.toFixed(2)} findings=${p.findings.length}`,
  );
}
