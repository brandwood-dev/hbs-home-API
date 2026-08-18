import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  loadEnvironment,
} from "../src/config/environment.js";

describe("loadEnvironment", () => {
  it("loads safe defaults", () => {
    const environment = loadEnvironment({ NODE_ENV: "test" });
    expect(environment.port).toBe(3000);
    expect(environment.docsEnabled).toBe(true);
    expect(environment.logLevel).toBe("silent");
  });

  it("parses a comma-separated CORS allowlist", () => {
    const environment = loadEnvironment({
      NODE_ENV: "staging",
      CORS_ORIGINS:
        "https://preview.hbs-home.com, https://admin-preview.hbs-home.com",
    });
    expect(environment.corsOrigins).toEqual([
      "https://preview.hbs-home.com",
      "https://admin-preview.hbs-home.com",
    ]);
  });

  it("disables API documentation by default in production", () => {
    const environment = loadEnvironment({ NODE_ENV: "production" });
    expect(environment.docsEnabled).toBe(false);
  });

  it("uses the immutable Render commit SHA when available", () => {
    const environment = loadEnvironment({
      NODE_ENV: "staging",
      RENDER_GIT_COMMIT: "0123456789abcdef",
    });
    expect(environment.gitSha).toBe("0123456789abcdef");
  });

  it("rejects an invalid port without exposing environment values", () => {
    expect(() =>
      loadEnvironment({ NODE_ENV: "test", PORT: "secret-value" }),
    ).toThrow(ConfigurationError);
    expect(() =>
      loadEnvironment({ NODE_ENV: "test", PORT: "secret-value" }),
    ).toThrow("PORT must be an integer");
  });

  it("rejects a non-HTTP CORS origin", () => {
    expect(() =>
      loadEnvironment({
        NODE_ENV: "test",
        CORS_ORIGINS: "file:///sensitive/path",
      }),
    ).toThrow("invalid HTTP origin");
  });

  it("rejects wildcard CORS with credentialed requests", () => {
    expect(() =>
      loadEnvironment({ NODE_ENV: "test", CORS_ORIGINS: "*" }),
    ).toThrow("cannot use a wildcard");
  });

  it("rejects a CORS URL containing a path", () => {
    expect(() =>
      loadEnvironment({
        NODE_ENV: "test",
        CORS_ORIGINS: "https://preview.hbs-home.com/app",
      }),
    ).toThrow("invalid HTTP origin");
  });
});
