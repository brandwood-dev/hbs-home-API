import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createOpenApiDocument } from "./openapi-document.js";

const target = resolve(process.cwd(), "openapi/openapi.json");
const temporary = `${target}.tmp`;
const document = await createOpenApiDocument();

await mkdir(dirname(target), { recursive: true });
await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
await rename(temporary, target);

console.log(`OpenAPI contract written to ${target}`);
