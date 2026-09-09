import { runAllProviders, indexResults } from "../src/server/providers/registry";
import { demoBidders } from "../src/data/demo";

for (const b of demoBidders) {
  const results = await runAllProviders({
    bidderKey: b.key,
    pan: b.pan,
    gstin: b.gstin,
    cin: b.cin,
    udyamNumber: b.udyamNumber,
    legalName: b.legalName,
    name: b.name,
  });
  const idx = indexResults(results);
  const deb = idx.DEBARMENT;
  const gst = idx.GST;
  console.log(
    `${b.key}: sources=${results.length} GST=${gst?.status} DEBARMENT=${deb?.status}(debarred=${(deb?.payload as any)?.debarred})`,
  );
}
