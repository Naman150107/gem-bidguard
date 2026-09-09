import "server-only";

/**
 * Mock "logged-in" procurement officer used for audit attribution.
 * No authentication is implemented in this MVP — the officer identity comes
 * from environment variables so it is configurable and never hard-coded.
 */
export function getCurrentOfficer(): { id: string; name: string } {
  return {
    id: process.env.OFFICER_ID || "officer-001",
    name: process.env.OFFICER_NAME || "Procurement Officer (Demo)",
  };
}
