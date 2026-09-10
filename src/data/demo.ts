/**
 * Canonical demo dataset — the single source of truth for the seeded demo.
 *
 * Both `prisma/seed.ts` (which loads it into the database) and the mock
 * government providers (`src/server/providers/mockData.ts`, which simulate
 * external lookups) derive from this file, so the bidder-submitted documents
 * and the "government truth" stay perfectly in sync.
 *
 * The three bidders are engineered to exercise the engines end-to-end and
 * produce three clearly different outcomes (LOW / MODERATE / CRITICAL). The
 * outcomes are NOT hard-coded — they emerge from the deterministic rules
 * evaluating this data.
 *
 * Dates are fixed ISO strings (not relative to "now") so the demo is
 * reproducible. Validity windows are deliberately set so each bidder's outcome
 * is stable over time: compliant documents expire well after the tender
 * timeline (bid deadline 2026-10-15), while each deliberate lapse (e.g. XYZ's
 * expired EPFO document, PQR's expired OEM authorization) is already expired
 * and therefore fails deterministically whenever the demo is run.
 */

import {
  DocumentType,
  GovSource,
  ProviderStatus,
  RuleScope,
  WeightCategory,
  Severity,
  type DocumentType as DocumentTypeT,
  type GovSource as GovSourceT,
  type ProviderStatus as ProviderStatusT,
  type RuleScope as RuleScopeT,
  type WeightCategory as WeightCategoryT,
  type Severity as SeverityT,
} from "../lib/types";

// ---------------------------------------------------------------------------
// Dataset shape
// ---------------------------------------------------------------------------

export interface DemoDocument {
  type: DocumentTypeT;
  fileName: string;
  content: string;
  issueDate?: string;
  expiryDate?: string;
}

export interface GovRecord {
  status: ProviderStatusT;
  confidence: number;
  payload: Record<string, unknown>;
}

export interface DemoBidder {
  key: string;
  name: string;
  legalName: string;
  pan: string;
  gstin: string;
  udyamNumber?: string;
  cin?: string;
  msmeCategory?: string;
  isStartup: boolean;
  address: string;
  contactEmail: string;
  contactPhone: string;
  declaredLocalContentPct?: number;
  expectedRiskNote: string;
  documents: DemoDocument[];
  /** Authoritative records returned by the (mock) government sources. */
  government: Partial<Record<GovSourceT, GovRecord>>;
}

export interface DemoRequirement {
  code: string;
  title: string;
  description: string;
  mandatory: boolean;
  category: string;
}

export interface DemoRule {
  code: string;
  title: string;
  description: string;
  scope: RuleScopeT;
  weightCategory: WeightCategoryT;
  severityOnFail: SeverityT;
  config?: Record<string, unknown>;
}

export interface DemoDataset {
  tender: {
    referenceNo: string;
    title: string;
    ministry: string;
    category: string;
    estimatedValue: number;
    bidSubmissionDeadline: string;
    description: string;
  };
  requirements: DemoRequirement[];
  rules: DemoRule[];
  bidders: DemoBidder[];
}

// ---------------------------------------------------------------------------
// Tender
// ---------------------------------------------------------------------------

const tender: DemoDataset["tender"] = {
  referenceNo: "GEM/2026/B/PNG/4471123",
  title:
    "Supply, Installation & Commissioning of Industrial-Grade Centrifugal Pumps for Refinery Operations",
  ministry: "Ministry of Petroleum & Natural Gas",
  category: "Goods",
  estimatedValue: 45_000_000,
  bidSubmissionDeadline: "2026-10-15T18:00:00.000Z",
  description:
    "Procurement of industrial-grade centrifugal pumps (API 610 compliant) including supply, installation, commissioning and 2-year comprehensive maintenance for refinery operations. Bidders must satisfy statutory, financial, technical and Make-in-India local content requirements.",
};

// ---------------------------------------------------------------------------
// Tender requirements (what the bid must satisfy)
// ---------------------------------------------------------------------------

const requirements: DemoRequirement[] = [
  {
    code: "REQ-EMD",
    title: "Earnest Money Deposit",
    description:
      "EMD of ₹9,00,000 via valid instrument, or a valid EMD exemption (MSME/NSIC).",
    mandatory: true,
    category: "Financial",
  },
  {
    code: "REQ-TURNOVER",
    title: "Minimum Average Annual Turnover",
    description: "Average annual turnover of at least ₹3.00 Cr in the last 3 financial years.",
    mandatory: true,
    category: "Financial",
  },
  {
    code: "REQ-OEM",
    title: "OEM Authorization",
    description: "Valid OEM authorization certificate for the quoted pump make/model.",
    mandatory: true,
    category: "Technical",
  },
  {
    code: "REQ-EXP",
    title: "Past Experience",
    description: "At least 2 similar supply orders executed in the last 5 years.",
    mandatory: true,
    category: "Technical",
  },
  {
    code: "REQ-LOCAL-CONTENT",
    title: "Local Content (Make in India)",
    description: "Minimum 50% local content; Class-I/II local supplier as per PPP-MII Order.",
    mandatory: true,
    category: "Eligibility",
  },
  {
    code: "REQ-GST",
    title: "Valid GST Registration",
    description: "Active GST registration verifiable on the GST portal.",
    mandatory: true,
    category: "Statutory",
  },
  {
    code: "REQ-PAN",
    title: "Valid PAN",
    description: "Valid PAN verifiable with the Income Tax database.",
    mandatory: true,
    category: "Statutory",
  },
  {
    code: "REQ-LABOUR",
    title: "Labour Compliance (EPFO & ESIC)",
    description: "Valid EPFO and ESIC registration where applicable.",
    mandatory: true,
    category: "Statutory",
  },
  {
    code: "REQ-BLACKLIST",
    title: "Not Blacklisted / Debarred",
    description: "Bidder must not be under any active debarment or blacklisting.",
    mandatory: true,
    category: "Eligibility",
  },
  {
    code: "REQ-UDYAM",
    title: "Udyam / MSME Registration",
    description: "Udyam registration (optional; enables EMD exemption and MSME benefits).",
    mandatory: false,
    category: "Eligibility",
  },
];

// ---------------------------------------------------------------------------
// Deterministic compliance rules (logic lives in the compliance engine;
// thresholds are configurable here via `config`).
// ---------------------------------------------------------------------------

const rules: DemoRule[] = [
  {
    code: "RULE-EMD",
    title: "EMD present or validly exempted",
    description: "EMD paid, or a valid MSME/NSIC exemption is claimed and substantiated.",
    scope: RuleScope.TENDER,
    weightCategory: WeightCategory.MANDATORY,
    severityOnFail: Severity.HIGH,
  },
  {
    code: "RULE-TURNOVER",
    title: "Minimum average annual turnover",
    description: "Average turnover over last 3 FYs meets the tender threshold.",
    scope: RuleScope.TENDER,
    weightCategory: WeightCategory.MANDATORY,
    severityOnFail: Severity.HIGH,
    config: { minTurnoverCr: 3 },
  },
  {
    code: "RULE-OEM",
    title: "Valid OEM authorization",
    description: "OEM authorization present and not expired (warns if expiring soon).",
    scope: RuleScope.TENDER,
    weightCategory: WeightCategory.MANDATORY,
    severityOnFail: Severity.HIGH,
    config: { warnWithinDays: 60 },
  },
  {
    code: "RULE-EXP",
    title: "Past experience (similar orders)",
    description: "Number of similar supply orders in the last 5 years meets the threshold.",
    scope: RuleScope.TENDER,
    weightCategory: WeightCategory.MANDATORY,
    severityOnFail: Severity.MEDIUM,
    config: { minOrders: 2, warnAt: 1 },
  },
  {
    code: "RULE-LOCAL-CONTENT",
    title: "Minimum local content",
    description: "Declared local content meets the Make-in-India minimum.",
    scope: RuleScope.TENDER,
    weightCategory: WeightCategory.MANDATORY,
    severityOnFail: Severity.HIGH,
    config: { minPct: 50 },
  },
  {
    code: "RULE-GST",
    title: "GST registration active",
    description: "GST source confirms an active registration.",
    scope: RuleScope.STATUTORY,
    weightCategory: WeightCategory.STATUTORY,
    severityOnFail: Severity.HIGH,
  },
  {
    code: "RULE-PAN",
    title: "PAN valid",
    description: "PAN source confirms a valid PAN.",
    scope: RuleScope.STATUTORY,
    weightCategory: WeightCategory.STATUTORY,
    severityOnFail: Severity.HIGH,
  },
  {
    code: "RULE-EPFO",
    title: "EPFO registration active",
    description: "EPFO source confirms active registration (warns on arrears).",
    scope: RuleScope.STATUTORY,
    weightCategory: WeightCategory.STATUTORY,
    severityOnFail: Severity.MEDIUM,
  },
  {
    code: "RULE-ESIC",
    title: "ESIC registration active",
    description: "ESIC source confirms active registration.",
    scope: RuleScope.STATUTORY,
    weightCategory: WeightCategory.STATUTORY,
    severityOnFail: Severity.MEDIUM,
  },
  {
    code: "RULE-BLACKLIST",
    title: "Not debarred / blacklisted",
    description: "No active debarment found in the debarment registry.",
    scope: RuleScope.STATUTORY,
    weightCategory: WeightCategory.STATUTORY,
    severityOnFail: Severity.CRITICAL,
  },
  {
    code: "RULE-DOC-COMPLETENESS",
    title: "Mandatory documents present",
    description: "All mandatory supporting documents are present.",
    scope: RuleScope.DOCUMENT,
    weightCategory: WeightCategory.DOCUMENT,
    severityOnFail: Severity.HIGH,
    config: {
      requiredDocs: [
        DocumentType.GST_CERTIFICATE,
        DocumentType.PAN_CARD,
        DocumentType.ITR,
        DocumentType.OEM_AUTHORIZATION,
        DocumentType.LOCAL_CONTENT_DECLARATION,
        DocumentType.EPFO,
        DocumentType.ESIC,
        DocumentType.BID_DECLARATION,
      ],
    },
  },
  {
    code: "RULE-DOC-VALIDITY",
    title: "No expired documents",
    description: "No submitted document is expired (warns if expiring soon).",
    scope: RuleScope.DOCUMENT,
    weightCategory: WeightCategory.DOCUMENT,
    severityOnFail: Severity.MEDIUM,
    config: { warnWithinDays: 30 },
  },
  {
    code: "RULE-PAN-CONSISTENCY",
    title: "PAN consistent across sources",
    description: "PAN matches across PAN card, GST certificate and government records.",
    scope: RuleScope.CONSISTENCY,
    weightCategory: WeightCategory.CONSISTENCY,
    severityOnFail: Severity.HIGH,
  },
  {
    code: "RULE-GSTIN-CONSISTENCY",
    title: "GSTIN consistent across sources",
    description: "GSTIN matches across the GST certificate and the bid declaration.",
    scope: RuleScope.CONSISTENCY,
    weightCategory: WeightCategory.CONSISTENCY,
    severityOnFail: Severity.MEDIUM,
  },
  {
    code: "RULE-NAME-CONSISTENCY",
    title: "Legal name consistent across sources",
    description: "Legal name matches across documents and government records.",
    scope: RuleScope.CONSISTENCY,
    weightCategory: WeightCategory.CONSISTENCY,
    severityOnFail: Severity.MEDIUM,
  },
  {
    code: "RULE-ADDRESS-CONSISTENCY",
    title: "Address consistent across sources",
    description: "Registered address matches across documents and government records.",
    scope: RuleScope.CONSISTENCY,
    weightCategory: WeightCategory.CONSISTENCY,
    severityOnFail: Severity.LOW,
  },
];

// ---------------------------------------------------------------------------
// Document text helpers
// ---------------------------------------------------------------------------

function doc(
  type: DocumentTypeT,
  fileName: string,
  content: string,
  dates?: { issueDate?: string; expiryDate?: string },
): DemoDocument {
  return { type, fileName, content: content.trim(), ...dates };
}

// ===========================================================================
// BIDDER 1 — ABC Engineering Pvt Ltd  (expected: LOW risk, highly compliant)
// ===========================================================================

const abc: DemoBidder = {
  key: "ABC",
  name: "ABC Engineering Pvt Ltd",
  legalName: "ABC Engineering Private Limited",
  pan: "AABCA1234R",
  gstin: "27AABCA1234R1Z5",
  udyamNumber: "UDYAM-MH-18-0012345",
  cin: "U29120MH2009PTC012345",
  msmeCategory: "Small",
  isStartup: false,
  address: "Plot 42, MIDC Industrial Area, Pune, Maharashtra 411019",
  contactEmail: "tenders@abcengineering.co.in",
  contactPhone: "+91-20-4567-8900",
  declaredLocalContentPct: 65,
  expectedRiskNote: "Fully compliant across all categories — expected LOW risk.",
  documents: [
    doc(
      DocumentType.GST_CERTIFICATE,
      "ABC_GST_Certificate.pdf",
      `GOVERNMENT OF INDIA — GOODS AND SERVICES TAX
Form GST REG-06 — Certificate of Registration
GSTIN: 27AABCA1234R1Z5
Legal Name: ABC Engineering Private Limited
Trade Name: ABC Engineering
PAN: AABCA1234R
Constitution of Business: Private Limited Company
Address: Plot 42, MIDC Industrial Area, Pune, Maharashtra 411019
Date of Registration: 2018-07-01
Status: Active`,
      { issueDate: "2018-07-01" },
    ),
    doc(
      DocumentType.PAN_CARD,
      "ABC_PAN.pdf",
      `INCOME TAX DEPARTMENT — GOVERNMENT OF INDIA
Permanent Account Number Card
PAN: AABCA1234R
Name: ABC ENGINEERING PRIVATE LIMITED
Date of Incorporation: 2009-03-12`,
    ),
    doc(
      DocumentType.UDYAM_CERTIFICATE,
      "ABC_Udyam.pdf",
      `MINISTRY OF MSME — UDYAM REGISTRATION CERTIFICATE
Udyam Registration Number: UDYAM-MH-18-0012345
Name of Enterprise: ABC Engineering Private Limited
Type of Enterprise: Small
PAN: AABCA1234R
Address: Plot 42, MIDC Industrial Area, Pune, Maharashtra 411019
Status: Active`,
      { issueDate: "2020-09-15" },
    ),
    doc(
      DocumentType.ITR,
      "ABC_ITR_Turnover.pdf",
      `INCOME TAX RETURN — TURNOVER CERTIFICATE (CA Certified)
Name: ABC Engineering Private Limited
PAN: AABCA1234R
Turnover FY 2023-24: INR 7.80 Crore
Turnover FY 2022-23: INR 8.10 Crore
Turnover FY 2021-22: INR 8.70 Crore
Average Annual Turnover (last 3 FY): INR 8.20 Crore`,
    ),
    doc(
      DocumentType.OEM_AUTHORIZATION,
      "ABC_OEM_Authorization.pdf",
      `OEM AUTHORIZATION CERTIFICATE
OEM Name: Kirloskar Brothers Limited
Authorized Dealer: ABC Engineering Private Limited
Authorized Make/Model: Kirloskar KDS Series Centrifugal Pumps
Authorization Valid Upto: 2027-06-30
Status: Valid`,
      { issueDate: "2025-06-30", expiryDate: "2027-06-30" },
    ),
    doc(
      DocumentType.LOCAL_CONTENT_DECLARATION,
      "ABC_Local_Content.pdf",
      `LOCAL CONTENT DECLARATION (PPP-MII Order 2017)
Name: ABC Engineering Private Limited
Local Content Percentage: 65%
Supplier Category: Class-I Local Supplier
Signed by: Authorized Signatory`,
    ),
    doc(
      DocumentType.EPFO,
      "ABC_EPFO.pdf",
      `EMPLOYEES' PROVIDENT FUND ORGANISATION
Establishment Code: MHPUN1234567000
Name: ABC Engineering Private Limited
PAN: AABCA1234R
Status: Active
Valid Upto: 2027-03-31`,
      { expiryDate: "2027-03-31" },
    ),
    doc(
      DocumentType.ESIC,
      "ABC_ESIC.pdf",
      `EMPLOYEES' STATE INSURANCE CORPORATION
ESIC Code: 31000123450001007
Name: ABC Engineering Private Limited
PAN: AABCA1234R
Status: Active`,
    ),
    doc(
      DocumentType.BID_DECLARATION,
      "ABC_Bid_Declaration.pdf",
      `BIDDER SELF-DECLARATION
Bidder Name: ABC Engineering Private Limited
PAN: AABCA1234R
GSTIN: 27AABCA1234R1Z5
Registered Address: Plot 42, MIDC Industrial Area, Pune, Maharashtra 411019
Blacklisted/Debarred by any Government entity: No
Similar Supply Orders (last 5 years): 4
EMD Paid: INR 9,00,000
EMD Exemption Claimed: No`,
    ),
  ],
  government: {
    [GovSource.GST]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.99,
      payload: {
        gstin: "27AABCA1234R1Z5",
        legalName: "ABC ENGINEERING PRIVATE LIMITED",
        pan: "AABCA1234R",
        registrationStatus: "Active",
        address: "Plot 42, MIDC Industrial Area, Pune, Maharashtra 411019",
      },
    },
    [GovSource.PAN]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.99,
      payload: { pan: "AABCA1234R", name: "ABC ENGINEERING PRIVATE LIMITED", status: "VALID" },
    },
    [GovSource.UDYAM]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.97,
      payload: {
        udyamNumber: "UDYAM-MH-18-0012345",
        enterpriseType: "Small",
        pan: "AABCA1234R",
        status: "Active",
      },
    },
    [GovSource.MCA]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.98,
      payload: {
        cin: "U29120MH2009PTC012345",
        companyName: "ABC ENGINEERING PRIVATE LIMITED",
        status: "Active",
      },
    },
    [GovSource.EPFO]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.96,
      payload: { establishmentCode: "MHPUN1234567000", status: "ACTIVE", pan: "AABCA1234R" },
    },
    [GovSource.ESIC]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.96,
      payload: { esicCode: "31000123450001007", status: "ACTIVE", pan: "AABCA1234R" },
    },
    [GovSource.DEBARMENT]: {
      status: ProviderStatus.NOT_FOUND,
      confidence: 0.99,
      payload: { debarred: false },
    },
  },
};

// ===========================================================================
// BIDDER 2 — XYZ Manufacturing Ltd  (expected: MODERATE risk, some warnings)
// ===========================================================================

const xyz: DemoBidder = {
  key: "XYZ",
  name: "XYZ Manufacturing Ltd",
  legalName: "XYZ Manufacturing Limited",
  pan: "AAACX5678Q",
  gstin: "24AAACX5678Q1Z8",
  udyamNumber: undefined,
  cin: "U27100GJ2012PLC067890",
  msmeCategory: undefined,
  isStartup: false,
  address: "Survey 88, GIDC, Vapi, Gujarat 396195",
  contactEmail: "bids@xyzmanufacturing.com",
  contactPhone: "+91-260-242-1100",
  declaredLocalContentPct: 55,
  expectedRiskNote:
    "Compliant on essentials but needs review (unverifiable experience, EPFO arrears, expired EPFO doc, address/GSTIN inconsistencies) — expected MODERATE risk.",
  documents: [
    doc(
      DocumentType.GST_CERTIFICATE,
      "XYZ_GST_Certificate.pdf",
      `GOVERNMENT OF INDIA — GOODS AND SERVICES TAX
Form GST REG-06 — Certificate of Registration
GSTIN: 24AAACX5678Q1Z8
Legal Name: XYZ Manufacturing Limited
PAN: AAACX5678Q
Constitution of Business: Public Limited Company
Address: Survey 88, GIDC, Vapi, Gujarat 396195
Date of Registration: 2017-04-10
Status: Active`,
      { issueDate: "2017-04-10" },
    ),
    doc(
      DocumentType.PAN_CARD,
      "XYZ_PAN.pdf",
      `INCOME TAX DEPARTMENT — GOVERNMENT OF INDIA
Permanent Account Number Card
PAN: AAACX5678Q
Name: XYZ MANUFACTURING LIMITED`,
    ),
    doc(
      DocumentType.ITR,
      "XYZ_ITR_Turnover.pdf",
      `INCOME TAX RETURN — TURNOVER CERTIFICATE (CA Certified)
Name: XYZ Manufacturing Limited
PAN: AAACX5678Q
Turnover FY 2023-24: INR 3.60 Crore
Turnover FY 2022-23: INR 3.40 Crore
Turnover FY 2021-22: INR 3.20 Crore
Average Annual Turnover (last 3 FY): INR 3.40 Crore`,
    ),
    doc(
      DocumentType.OEM_AUTHORIZATION,
      "XYZ_OEM_Authorization.pdf",
      `OEM AUTHORIZATION CERTIFICATE
OEM Name: Grundfos Pumps India
Authorized Dealer: XYZ Manufacturing Limited
Authorized Make/Model: Grundfos NK Series Centrifugal Pumps
Authorization Valid Upto: 2027-10-30
Status: Valid`,
      { issueDate: "2025-10-30", expiryDate: "2027-10-30" },
    ),
    doc(
      DocumentType.LOCAL_CONTENT_DECLARATION,
      "XYZ_Local_Content.pdf",
      `LOCAL CONTENT DECLARATION (PPP-MII Order 2017)
Name: XYZ Manufacturing Limited
Local Content Percentage: 55%
Supplier Category: Class-I Local Supplier`,
    ),
    doc(
      DocumentType.EPFO,
      "XYZ_EPFO.pdf",
      `EMPLOYEES' PROVIDENT FUND ORGANISATION
Establishment Code: GJVAP0987654000
Name: XYZ Manufacturing Limited
PAN: AAACX5678Q
Status: Active
Valid Upto: 2026-06-30`,
      { expiryDate: "2026-06-30" },
    ),
    doc(
      DocumentType.ESIC,
      "XYZ_ESIC.pdf",
      `EMPLOYEES' STATE INSURANCE CORPORATION
ESIC Code: 37000567890001009
Name: XYZ Manufacturing Limited
PAN: AAACX5678Q
Status: Active`,
    ),
    doc(
      DocumentType.BID_DECLARATION,
      "XYZ_Bid_Declaration.pdf",
      `BIDDER SELF-DECLARATION
Bidder Name: XYZ Manufacturing Limited
PAN: AAACX5678Q
GSTIN: 24AAACX5678Q1Z9
Registered Address: Survey 88, GIDC, Vapi, Gujarat 396195
Blacklisted/Debarred by any Government entity: No
Similar Supply Orders (last 5 years): see enclosed annexure
EMD Paid: INR 9,00,000
EMD Exemption Claimed: No`,
    ),
  ],
  government: {
    [GovSource.GST]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.98,
      payload: {
        gstin: "24AAACX5678Q1Z8",
        legalName: "XYZ MANUFACTURING LIMITED",
        pan: "AAACX5678Q",
        registrationStatus: "Active",
        address: "Survey 90, GIDC Estate, Vapi, Gujarat 396195",
      },
    },
    [GovSource.PAN]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.99,
      payload: { pan: "AAACX5678Q", name: "XYZ MANUFACTURING LIMITED", status: "VALID" },
    },
    [GovSource.MCA]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.97,
      payload: {
        cin: "U27100GJ2012PLC067890",
        companyName: "XYZ MANUFACTURING LIMITED",
        status: "Active",
      },
    },
    [GovSource.EPFO]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.9,
      payload: {
        establishmentCode: "GJVAP0987654000",
        status: "ACTIVE_WITH_ARREARS",
        pan: "AAACX5678Q",
        note: "Contribution arrears reported for latest period.",
      },
    },
    [GovSource.ESIC]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.95,
      payload: { esicCode: "37000567890001009", status: "ACTIVE", pan: "AAACX5678Q" },
    },
    [GovSource.DEBARMENT]: {
      status: ProviderStatus.NOT_FOUND,
      confidence: 0.99,
      payload: { debarred: false },
    },
  },
};

// ===========================================================================
// BIDDER 3 — PQR Technologies Pvt Ltd  (expected: CRITICAL risk, major issues)
// ===========================================================================

const pqr: DemoBidder = {
  key: "PQR",
  name: "PQR Technologies Pvt Ltd",
  legalName: "PQR Technologies Pvt Ltd",
  // Declared PAN (from PAN card) intentionally differs from the PAN embedded in
  // the GST record (AAFPQ1111K) — a genuine identity discrepancy.
  pan: "AAFPQ9999K",
  gstin: "07AAFPQ1111K1Z3",
  udyamNumber: undefined,
  cin: "U72200HR2015PTC055555",
  msmeCategory: undefined,
  isStartup: false,
  address: "Office 12, Sector 44, Gurugram, Haryana 122003",
  contactEmail: "info@pqrtech.in",
  contactPhone: "+91-124-400-5566",
  declaredLocalContentPct: 30,
  expectedRiskNote:
    "Active debarment, GST suspended, PAN/name mismatches, expired OEM, missing labour docs, sub-threshold turnover and local content, unpaid EMD, and a false 'not debarred' declaration — expected CRITICAL risk.",
  documents: [
    doc(
      DocumentType.GST_CERTIFICATE,
      "PQR_GST_Certificate.pdf",
      `GOVERNMENT OF INDIA — GOODS AND SERVICES TAX
Form GST REG-06 — Certificate of Registration
GSTIN: 07AAFPQ1111K1Z3
Legal Name: PQR Tech Solutions Private Limited
PAN: AAFPQ1111K
Constitution of Business: Private Limited Company
Address: 3rd Floor, Cyber Hub, Gurugram, Haryana 122002
Date of Registration: 2016-02-20
Status: Active`,
      { issueDate: "2016-02-20" },
    ),
    doc(
      DocumentType.PAN_CARD,
      "PQR_PAN.pdf",
      `INCOME TAX DEPARTMENT — GOVERNMENT OF INDIA
Permanent Account Number Card
PAN: AAFPQ9999K
Name: PQR TECHNOLOGIES PRIVATE LIMITED`,
    ),
    doc(
      DocumentType.ITR,
      "PQR_ITR_Turnover.pdf",
      `INCOME TAX RETURN — TURNOVER CERTIFICATE
Name: PQR Technologies Pvt Ltd
PAN: AAFPQ9999K
Turnover FY 2023-24: INR 1.20 Crore
Turnover FY 2022-23: INR 1.10 Crore
Turnover FY 2021-22: INR 1.00 Crore
Average Annual Turnover (last 3 FY): INR 1.10 Crore`,
    ),
    doc(
      DocumentType.OEM_AUTHORIZATION,
      "PQR_OEM_Authorization.pdf",
      `OEM AUTHORIZATION CERTIFICATE
OEM Name: Generic Pumps Co.
Authorized Dealer: PQR Technologies Pvt Ltd
Authorized Make/Model: GP Series Pumps
Authorization Valid Upto: 2024-05-31
Status: EXPIRED`,
      { issueDate: "2022-06-01", expiryDate: "2024-05-31" },
    ),
    doc(
      DocumentType.LOCAL_CONTENT_DECLARATION,
      "PQR_Local_Content.pdf",
      `LOCAL CONTENT DECLARATION (PPP-MII Order 2017)
Name: PQR Technologies Pvt Ltd
Local Content Percentage: 30%
Supplier Category: Non-Local Supplier`,
    ),
    doc(
      DocumentType.BID_DECLARATION,
      "PQR_Bid_Declaration.pdf",
      `BIDDER SELF-DECLARATION
Bidder Name: PQR Technologies Pvt Ltd
PAN: AAFPQ9999K
GSTIN: 07AAFPQ1111K1Z3
Registered Address: Office 12, Sector 44, Gurugram, Haryana 122003
Blacklisted/Debarred by any Government entity: No
Similar Supply Orders (last 5 years): 0
EMD Paid: INR 0
EMD Exemption Claimed: No`,
    ),
    // NOTE: EPFO, ESIC and Udyam documents are intentionally absent.
  ],
  government: {
    [GovSource.GST]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.98,
      payload: {
        gstin: "07AAFPQ1111K1Z3",
        legalName: "PQR TECH SOLUTIONS PRIVATE LIMITED",
        pan: "AAFPQ1111K",
        registrationStatus: "Suspended",
        address: "3rd Floor, Cyber Hub, Gurugram, Haryana 122002",
      },
    },
    // The declared PAN (AAFPQ9999K) is not found; the true entity PAN is AAFPQ1111K.
    [GovSource.PAN]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.99,
      payload: { pan: "AAFPQ1111K", name: "PQR TECH SOLUTIONS PRIVATE LIMITED", status: "VALID" },
    },
    [GovSource.MCA]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.97,
      payload: {
        cin: "U72200HR2015PTC055555",
        companyName: "PQR TECH SOLUTIONS PRIVATE LIMITED",
        status: "Active",
      },
    },
    [GovSource.DEBARMENT]: {
      status: ProviderStatus.VERIFIED,
      confidence: 0.97,
      payload: {
        debarred: true,
        authority: "Bharat Refineries Ltd (PSU)",
        reason: "Submission of forged experience certificates",
        periodFrom: "2025-08-01",
        periodTo: "2027-07-31",
      },
    },
    // EPFO, ESIC, UDYAM, STARTUP_INDIA, NSIC intentionally omitted -> NOT_FOUND at lookup.
  },
};

// ---------------------------------------------------------------------------

export const demoDataset: DemoDataset = {
  tender,
  requirements,
  rules,
  bidders: [abc, xyz, pqr],
};

export const demoBidders = demoDataset.bidders;
