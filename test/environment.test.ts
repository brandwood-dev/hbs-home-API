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
    expect(environment.orderEmailNotificationsEnabled).toBe(false);
    expect(environment.smtpHost).toBe("ssl0.ovh.net");
  });

  it("requires SMTP credentials when order emails are enabled", () => {
    expect(() =>
      loadEnvironment({
        NODE_ENV: "test",
        ORDER_EMAIL_NOTIFICATIONS_ENABLED: "true",
      }),
    ).toThrow(
      "SMTP_USER and SMTP_PASSWORD are required when order email notifications are enabled",
    );
  });

  it("loads OVH SMTP settings when order emails are enabled", () => {
    const environment = loadEnvironment({
      NODE_ENV: "test",
      ORDER_EMAIL_NOTIFICATIONS_ENABLED: "true",
      SMTP_HOST: "ssl0.ovh.net",
      SMTP_PORT: "587",
      SMTP_USER: "contact@hbs-home.com",
      SMTP_PASSWORD: "test-only-secret",
      EMAIL_FROM: "contact@hbs-home.com",
      ADMIN_APP_URL: "https://preview.hbs-home.com",
    });

    expect(environment.orderEmailNotificationsEnabled).toBe(true);
    expect(environment.smtpPort).toBe(587);
    expect(environment.smtpUser).toBe("contact@hbs-home.com");
  });

  it("parses a comma-separated CORS allowlist", () => {
    const environment = loadEnvironment({
      NODE_ENV: "staging",
      DATABASE_URL: "postgresql://postgres:secret@db.example.com/postgres",
      SUPABASE_URL: "https://project.supabase.co",
      CORS_ORIGINS:
        "https://preview.hbs-home.com, https://admin-preview.hbs-home.com",
    });
    expect(environment.corsOrigins).toEqual([
      "https://preview.hbs-home.com",
      "https://admin-preview.hbs-home.com",
    ]);
  });

  it("disables API documentation by default in production", () => {
    const environment = loadEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://postgres:secret@db.example.com/postgres",
      SUPABASE_URL: "https://project.supabase.co",
    });
    expect(environment.docsEnabled).toBe(false);
  });

  it("uses the immutable Render commit SHA when available", () => {
    const environment = loadEnvironment({
      NODE_ENV: "staging",
      DATABASE_URL: "postgresql://postgres:secret@db.example.com/postgres",
      SUPABASE_URL: "https://project.supabase.co",
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

  it("requires Supabase and database configuration in staging", () => {
    expect(() => loadEnvironment({ NODE_ENV: "staging" })).toThrow(
      "DATABASE_URL is required",
    );
    expect(() =>
      loadEnvironment({
        NODE_ENV: "staging",
        DATABASE_URL: "postgresql://postgres:secret@db.example.com/postgres",
      }),
    ).toThrow("SUPABASE_URL is required");
  });
});
