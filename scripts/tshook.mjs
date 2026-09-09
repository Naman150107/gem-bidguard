import { register } from "node:module";

/**
 * Registers the extensionless-import resolver (resolver.mjs) so scripts run via
 *   node --experimental-strip-types --import ./scripts/tshook.mjs <file>.ts
 * can import our extensionless .ts modules. Used only for offline engine
 * verification; the Next.js app and Prisma tooling are unaffected.
 */
register("./resolver.mjs", import.meta.url);
