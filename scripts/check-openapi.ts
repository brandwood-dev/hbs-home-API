import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createOpenApiDocument } from "./openapi-document.js";

const target = resolve(process.cwd(), "openapi/openapi.json");
const committed = JSON.parse(await readFile(target, "utf8")) as unknown;
const generated = await createOpenApiDocument();

if (!isDeepStrictEqual(committed, generated)) {
  console.error(
    "The committed OpenAPI contract is stale. Run `bun run openapi:generate`.",
  );
  process.exitCode = 1;
} else {
  console.log("The committed OpenAPI contract is up to date.");
}
