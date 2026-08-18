import type { OpenAPIV3 } from "openapi-types";
import { buildApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/environment.js";

export async function createOpenApiDocument(): Promise<OpenAPIV3.Document> {
  const environment = loadEnvironment({
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "3000",
    LOG_LEVEL: "silent",
    CORS_ORIGINS: "http://localhost:3001",
    DOCS_ENABLED: "false",
    API_PUBLIC_URL: "http://localhost:3000",
    RELEASE_VERSION: "0.1.0",
    GIT_SHA: "contract",
    BUILD_TIME: "1970-01-01T00:00:00.000Z",
  });
  const app = await buildApp({ environment, logger: false });
  try {
    return app.swagger() as OpenAPIV3.Document;
  } finally {
    await app.close();
  }
}
