import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

/**
 * Module resolver hook so Node's built-in TypeScript type-stripping
 * (`--experimental-strip-types`) can run our source directly in-sandbox.
 *
 * Our source uses extensionless relative imports (the tsc/Next standard).
 * Node's default ESM resolver will not add a `.ts` extension, so we map
 * "./foo" -> "./foo.ts" (or "./foo/index.ts") here.
 *
 * We deliberately return only { url, shortCircuit } and NOT a `format`, so the
 * default load hook still applies type-stripping to the resolved .ts file.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
    const parentPath = context.parentURL
      ? fileURLToPath(context.parentURL)
      : process.cwd();
    const base = resolvePath(dirname(parentPath), specifier);
    for (const candidate of [`${base}.ts`, resolvePath(base, "index.ts")]) {
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
