import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";
import type { DatabaseSchema, OutboxEventTable } from "../database/schema.js";
import type { Environment } from "../config/environment.js";
import type { PostgresCustomQuoteRepository } from "../quotes/custom-quote-repository.js";

type OutboxEvent = Selectable<OutboxEventTable>;
interface QuoteEmailWorkerOptions {
  database: Kysely<DatabaseSchema>;
  quoteRepository: PostgresCustomQuoteRepository;
  environment: Environment;
  logger: {
    info: (meta: object, message: string) => void;
    warn: (meta: object, message: string) => void;
    error: (meta: object, message: string) => void;
  };
}

const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const RETRY_BASE_DELAY_MS = 30 * 1000;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function labelProductType(value: string): string {
  return (
    (
      {
        rideaux: "Rideaux",
        voilages: "Voilages",
        stores: "Stores",
        ensemble_fenetre: "Ensemble de la fenêtre",
      } as Record<string, string>
    )[value] ?? value
  );
}

function labelContact(value: string): string {
  return (
    (
      { phone: "Téléphone", whatsapp: "WhatsApp", email: "E-mail" } as Record<
        string,
        string
      >
    )[value] ?? value
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  }).format(new Date(value));
}

function quoteMessage(
  quote: NonNullable<
    Awaited<ReturnType<PostgresCustomQuoteRepository["getById"]>>
  >,
  adminAppUrl: string,
) {
  const quoteUrl = `${adminAppUrl.replace(/\/+$/, "")}/admin/demandes-sur-mesure/${encodeURIComponent(quote.id)}`;
  const notes =
    typeof quote.preferences.notes === "string"
      ? quote.preferences.notes.trim()
      : "";
  const wantsAccessories = quote.preferences.wantsAccessories ? "Oui" : "Non";
  const openingsText = quote.openings
    .map((opening) => {
      return `- ${opening.label || "Ouverture"}: ${String(opening.widthCm || "?")} × ${String(opening.heightCm || "?")} cm · ${String(opening.quantity || 1)} unité(s)`;
    })
    .join("\n");
  const openingRows = quote.openings
    .map((opening) => {
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;">${escapeHtml(opening.label || "Ouverture")}</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(String(opening.widthCm || "?"))} × ${escapeHtml(String(opening.heightCm || "?"))} cm · ${escapeHtml(String(opening.quantity || 1))}</td></tr>`;
    })
    .join("");
  const customerEmail = quote.contact.email ?? "Non renseigné";
  const subject = `Nouvelle demande sur mesure · ${quote.reference}`;
  const text = [
    subject,
    `Reçue le : ${formatDate(quote.createdAt)}`,
    "",
    "Projet",
    `Type : ${labelProductType(quote.productType)}`,
    `Accessoires : ${wantsAccessories}`,
    "Ouvertures :",
    openingsText || "- Aucune ouverture",
    ...(notes ? ["", `Précisions : ${notes}`] : []),
    "",
    "Client",
    `Nom : ${quote.contact.firstName} ${quote.contact.lastName}`,
    `Téléphone : ${quote.contact.phone}`,
    `E-mail : ${customerEmail}`,
    `Gouvernorat : ${quote.contact.governorate}`,
    `Ville : ${quote.contact.city}`,
    `Contact préféré : ${labelContact(quote.contact.preferredContact)}`,
    "",
    `Ouvrir dans le back-office : ${quoteUrl}`,
  ].join("\n");
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f7f4f1;color:#211e1b;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:680px;margin:0 auto;padding:20px 12px;"><div style="background:#ad7658;color:#fff;padding:22px 20px;"><div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;">HBS HOME</div><h1 style="font-size:22px;line-height:1.25;font-weight:600;margin:12px 0 0;">Nouvelle demande sur mesure</h1></div><div style="background:#fff;padding:22px 20px;"><p style="margin:0;color:#6b625c;font-size:14px;line-height:1.5;">${escapeHtml(quote.reference)} · ${escapeHtml(formatDate(quote.createdAt))}</p><h2 style="font-size:16px;margin:24px 0 10px;">Projet</h2><p style="margin:0;line-height:1.6;"><strong>Type :</strong> ${escapeHtml(labelProductType(quote.productType))}<br /><strong>Accessoires :</strong> ${escapeHtml(wantsAccessories)}</p><h2 style="font-size:16px;margin:24px 0 10px;">Ouvertures</h2><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${openingRows || "<tr><td>Aucune ouverture</td></tr>"}</tbody></table>${notes ? `<h2 style="font-size:16px;margin:24px 0 10px;">Précisions</h2><p style="white-space:pre-line;margin:0;line-height:1.6;">${escapeHtml(notes)}</p>` : ""}<h2 style="font-size:16px;margin:24px 0 10px;">Coordonnées</h2><p style="margin:0;line-height:1.65;">${escapeHtml(quote.contact.firstName)} ${escapeHtml(quote.contact.lastName)}<br /><a href="tel:${escapeHtml(quote.contact.phone)}" style="color:#8f5d46;">${escapeHtml(quote.contact.phone)}</a><br />${escapeHtml(customerEmail)}<br />${escapeHtml(quote.contact.city)}, ${escapeHtml(quote.contact.governorate)}<br /><strong>Contact préféré :</strong> ${escapeHtml(labelContact(quote.contact.preferredContact))}</p><p style="margin:26px 0 0;"><a href="${escapeHtml(quoteUrl)}" style="display:block;text-align:center;background:#ad7658;color:#fff;text-decoration:none;padding:13px 16px;font-size:14px;">Voir la demande dans l’admin</a></p></div><div style="padding:16px 8px;text-align:center;color:#8b817a;font-size:11px;">HBS HOME · Demande reçue depuis le site</div></div></body></html>`;
  return { subject, text, html };
}

function messageId(eventId: string): string {
  return `quote-${eventId}`;
}

export class CustomQuoteEmailWorker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(private readonly options: QuoteEmailWorkerOptions) {}

  get enabled(): boolean {
    return Boolean(this.options.environment.brevoApiKey);
  }

  start(): void {
    if (!this.enabled) {
      this.options.logger.warn(
        {},
        "Custom quote email worker disabled: BREVO_API_KEY is missing",
      );
      return;
    }
    this.timer = setInterval(
      () => void this.tick(),
      this.options.environment.orderEmailPollIntervalSeconds * 1000,
    );
    this.timer.unref();
    void this.tick();
    this.options.logger.info({}, "Custom quote email worker started");
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.requeueExpiredProcessing();
      const events = await this.claimBatch();
      for (const event of events) await this.process(event);
    } catch (error) {
      this.options.logger.error(
        { err: error },
        "Custom quote email worker cycle failed",
      );
    } finally {
      this.running = false;
    }
  }

  private async claimBatch(): Promise<
    readonly (OutboxEvent & { attempts: number })[]
  > {
    const processingUntil = new Date(Date.now() + PROCESSING_TIMEOUT_MS);
    return this.options.database.transaction().execute(async (trx) => {
      const events = await trx
        .selectFrom("commerce.outbox_events")
        .selectAll()
        .where("status", "=", "pending")
        .where("aggregate_type", "=", "custom_quote")
        .where("event_type", "=", "custom_quote.created")
        .where("available_at", "<=", new Date())
        .orderBy("created_at", "asc")
        .orderBy("id", "asc")
        .limit(this.options.environment.orderEmailBatchSize)
        .forUpdate()
        .skipLocked()
        .execute();
      if (events.length === 0) return [];
      await trx
        .updateTable("commerce.outbox_events")
        .set({
          status: "processing",
          attempts: sql<number>`attempts + 1`,
          available_at: processingUntil,
        })
        .where(
          "id",
          "in",
          events.map((event) => event.id),
        )
        .execute();
      return events.map((event) => ({
        ...event,
        attempts: event.attempts + 1,
      }));
    });
  }

  private async process(
    event: OutboxEvent & { attempts: number },
  ): Promise<void> {
    try {
      const quoteId =
        typeof event.payload.quoteId === "string" ? event.payload.quoteId : "";
      if (!quoteId)
        throw new Error("custom_quote.created has no valid quoteId");
      const quote = await this.options.quoteRepository.getById(quoteId);
      if (!quote) throw new Error(`Custom quote ${quoteId} was not found`);
      const recipients = await this.listRecipients();
      if (recipients.length === 0) {
        this.options.logger.warn(
          { quoteId },
          "Custom quote email skipped: no active quotes.read recipient",
        );
        await this.markProcessed(event.id);
        return;
      }
      const message = quoteMessage(quote, this.options.environment.adminAppUrl);
      const brevoApiKey = this.options.environment.brevoApiKey;
      if (!brevoApiKey) throw new Error("BREVO_API_KEY is missing");
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": brevoApiKey,
          "content-type": "application/json",
          "Idempotency-Key": messageId(event.id),
        },
        body: JSON.stringify({
          sender: {
            email: this.options.environment.emailFrom,
            name: "HBS HOME",
          },
          to: recipients.map((recipient) => ({
            email: recipient.email,
            ...(recipient.displayName
              ? {
                  name: Array.from(recipient.displayName).slice(0, 70).join(""),
                }
              : {}),
          })),
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await response.text()).trim();
      if (!response.ok) {
        try {
          const parsed: unknown = JSON.parse(body);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "code" in parsed &&
            parsed.code === "duplicate_parameter"
          ) {
            await this.options.quoteRepository.markEmailSent(quoteId);
            await this.markProcessed(event.id);
            return;
          }
        } catch {
          // Preserve the original response below when Brevo does not return JSON.
        }
        throw new Error(
          `Brevo API request failed (${String(response.status)}): ${body.slice(0, 500)}`,
        );
      }
      await this.options.quoteRepository.markEmailSent(quoteId);
      await this.markProcessed(event.id);
    } catch (error) {
      await this.markFailed(event, error);
    }
  }

  private async listRecipients(): Promise<
    readonly { email: string; displayName: string | null }[]
  > {
    const rows = await this.options.database
      .selectFrom("iam.admin_profiles as profile")
      .innerJoin(
        "iam.admin_user_roles as membership",
        "membership.auth_user_id",
        "profile.auth_user_id",
      )
      .innerJoin(
        "iam.role_permissions as permission",
        "permission.role_key",
        "membership.role_key",
      )
      .select(["profile.email", "profile.display_name as displayName"])
      .where("profile.status", "=", "active")
      .where("permission.permission_key", "=", "quotes.read")
      .where("membership.revoked_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("membership.expires_at", "is", null),
          eb("membership.expires_at", ">", new Date()),
        ]),
      )
      .orderBy("profile.email", "asc")
      .execute();
    const seen = new Set<string>();
    return rows.filter((row) => {
      const email = row.email.trim().toLowerCase();
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
  }

  private async markProcessed(id: string): Promise<void> {
    await this.options.database
      .updateTable("commerce.outbox_events")
      .set({ status: "processed", processed_at: new Date(), last_error: null })
      .where("id", "=", id)
      .executeTakeFirst();
  }

  private async markFailed(
    event: OutboxEvent & { attempts: number },
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const deadLetter =
      event.attempts >= this.options.environment.orderEmailMaxAttempts;
    await this.options.database
      .updateTable("commerce.outbox_events")
      .set({
        status: deadLetter ? "dead_letter" : "pending",
        available_at: deadLetter
          ? new Date()
          : new Date(
              Date.now() +
                RETRY_BASE_DELAY_MS * 2 ** Math.min(event.attempts - 1, 6),
            ),
        last_error: message.slice(0, 1000),
      })
      .where("id", "=", event.id)
      .executeTakeFirst();
    if (typeof event.payload.quoteId === "string")
      await this.options.quoteRepository.markEmailFailed(
        event.payload.quoteId,
        message,
      );
    this.options.logger.error(
      { err: error, eventId: event.id, attempts: event.attempts, deadLetter },
      "Custom quote email notification failed",
    );
  }

  private async requeueExpiredProcessing(): Promise<void> {
    await this.options.database
      .updateTable("commerce.outbox_events")
      .set({ status: "pending", available_at: new Date() })
      .where("status", "=", "processing")
      .where("available_at", "<=", new Date())
      .executeTakeFirst();
  }
}

export function createCustomQuoteEmailWorker(
  options: QuoteEmailWorkerOptions,
): CustomQuoteEmailWorker {
  return new CustomQuoteEmailWorker(options);
}

export { quoteMessage };
