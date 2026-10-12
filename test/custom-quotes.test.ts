import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProblemDetailSchema } from "../src/http/problem.js";
import { registerCustomQuoteRoutes } from "../src/routes/custom-quotes.js";
import type { PostgresCustomQuoteRepository } from "../src/quotes/custom-quote-repository.js";

describe("professional custom quote submissions", () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close();
  });

  it("accepts a professional payload and routes it to the shared inbox", async () => {
    const created = {
      id: "00000000-0000-4000-8000-000000000001",
      reference: "PRO-20261012-ABC123",
      requestType: "professionnels" as const,
      professionalDetails: {
        companyName: "Atelier Test",
        activity: "architecte" as const,
        projectVolume: "10_50" as const,
        message: "Nous aménageons un hôtel et souhaitons un accompagnement.",
      },
      productType: "ensemble_fenetre" as const,
      openings: [],
      preferences: { wantsAccessories: false },
      contact: {
        firstName: "Nadia",
        lastName: "Ben Ali",
        phone: "+21620123456",
        email: "nadia@example.com",
        governorate: "Tunis",
        city: "Tunis",
        preferredContact: "email" as const,
      },
      attachmentMetadata: [],
      acceptedPrivacy: true as const,
      createdAt: "2026-10-12T00:00:00.000Z",
      readAt: null,
      archivedAt: null,
      emailSentAt: null,
    };
    const createProfessional = vi.fn().mockResolvedValue(created);
    const app = Fastify({ logger: false });
    apps.push(app);
    app.addSchema(ProblemDetailSchema);
    registerCustomQuoteRoutes(app, {
      database: {} as never,
      auditRepository: {} as never,
      customQuoteRepository: {
        createProfessional,
      } as unknown as PostgresCustomQuoteRepository,
      jwtVerifier: {} as never,
      adminAccessRepository: {} as never,
    });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/custom-quotes",
      payload: {
        requestType: "professionnels",
        companyName: "Atelier Test",
        activity: "architecte",
        contactName: "Nadia Ben Ali",
        phone: "+21620123456",
        email: "nadia@example.com",
        governorate: "Tunis",
        city: "Tunis",
        projectVolume: "10_50",
        message: "Nous aménageons un hôtel et souhaitons un accompagnement.",
        acceptedPrivacy: true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(createProfessional).toHaveBeenCalledOnce();
    expect(response.json()).toMatchObject({
      reference: "PRO-20261012-ABC123",
      requestType: "professionnels",
      professionalDetails: { companyName: "Atelier Test" },
    });
  });
});
