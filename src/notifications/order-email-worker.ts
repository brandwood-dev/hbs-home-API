import nodemailer, { type Transporter } from "nodemailer";
import { sql, type Kysely, type Selectable } from "kysely";
import type { Environment } from "../config/environment.js";
import type { DatabaseSchema } from "../database/schema.js";
import type {
  AdminOrder,
  PostgresAdminOrderRepository,
} from "../orders/admin-order-repository.js";

type OutboxEvent = Selectable<DatabaseSchema["commerce.outbox_events"]>;

interface NotificationRecipient {
  email: string;
  displayName: string | null;
}

interface WorkerLogger {
  info(metadata: object, message: string): void;
  warn(metadata: object, message: string): void;
  error(metadata: object, message: string): void;
}

interface OrderEmailMessage {
  subject: string;
  text: string;
  html: string;
}

interface OrderEmailTransport {
  send(
    message: OrderEmailMessage,
    recipients: readonly NotificationRecipient[],
    messageId: string,
  ): Promise<void>;
  close(): void;
}

interface OrderEmailWorkerOptions {
  database: Kysely<DatabaseSchema>;
  adminOrderRepository: Pick<PostgresAdminOrderRepository, "getById">;
  environment: Environment;
  logger: WorkerLogger;
}

const PROCESSING_TIMEOUT_MS = 2 * 60 * 1000;
const RETRY_BASE_DELAY_MS = 15 * 1000;
// Render runs in UTC, while HBS HOME's customer-facing times are Tunisian time.
// Keeping the zone explicit also handles any future runtime/hosting changes.
const STORE_TIME_ZONE = "Africa/Tunis";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

function money(amountMinor: number): string {
  return new Intl.NumberFormat("fr-TN", {
    style: "currency",
    currency: "TND",
    minimumFractionDigits: 3,
  }).format(amountMinor / 1000);
}

function deliveryLabel(method: AdminOrder["deliveryMethod"]): string {
  return method === "home_delivery"
    ? "Livraison à domicile"
    : "Retrait en magasin";
}

function paymentLabel(status: AdminOrder["paymentStatus"]): string {
  switch (status) {
    case "collected":
      return "Encaissé";
    case "refunded":
      return "Remboursé";
    default:
      return "À encaisser à la livraison";
  }
}

function orderStatusLabel(status: AdminOrder["status"]): string {
  return (
    {
      pending_confirmation: "En attente de confirmation",
      confirmed: "Confirmée",
      preparing: "En préparation",
      shipped: "Expédiée",
      delivered: "Livrée",
      cancelled: "Annulée",
    } satisfies Record<AdminOrder["status"], string>
  )[status];
}

function emailImageUrl(imageUrl: string, adminAppUrl: string): string | null {
  const value = imageUrl.trim();
  if (!value) return null;

  try {
    const url = new URL(value, adminAppUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function orderMessage(
  order: AdminOrder,
  adminAppUrl: string,
): OrderEmailMessage {
  const orderUrl = `${adminAppUrl.replace(/\/+$/, "")}/admin/commandes/${encodeURIComponent(order.id)}`;
  const formattedDate = new Intl.DateTimeFormat("fr-TN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: STORE_TIME_ZONE,
  }).format(new Date(order.createdAt));
  const logoUrl = emailImageUrl("/apple-touch-icon.png", adminAppUrl);
  const address = [
    order.addressLine,
    order.landmark,
    order.postalCode,
    order.city,
    order.governorate,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(", ");
  const itemText = order.items
    .map(
      (item) =>
        `- ${String(item.quantity)} × ${item.productName} (${item.variantLabel}, SKU ${item.sku}) — ${money(item.lineTotalMinor)}`,
    )
    .join("\n");
  const itemRows = order.items
    .map((item) => {
      const imageUrl = emailImageUrl(item.imageUrl, adminAppUrl);
      const imageMarkup = imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.imageAlt || item.productName)}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:6px;background:#f7f4f1;" />`
        : "";

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #eee;">
            <table style="border-collapse:collapse;">
              <tr>
                ${imageMarkup ? `<td style="width:64px;padding-right:12px;vertical-align:middle;">${imageMarkup}</td>` : ""}
                <td style="vertical-align:middle;">
                  <strong>${escapeHtml(item.productName)}</strong><br />
                  <span style="color:#6b625c;font-size:13px;">${escapeHtml(item.variantLabel)} · SKU ${escapeHtml(item.sku)}</span>
                </td>
              </tr>
            </table>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:center;">${String(item.quantity)}</td>
          <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(money(item.lineTotalMinor))}</td>
        </tr>`;
    })
    .join("");
  const customerEmail = order.customerEmail ?? "Non renseigné";
  const deliveryNote = order.deliveryNote?.trim();

  return {
    subject: `Nouvelle commande ${order.orderNumber} · ${money(order.totalMinor)}`,
    text: [
      `Nouvelle commande ${order.orderNumber}`,
      `Créée le : ${formattedDate}`,
      "",
      `Client : ${order.customerName}`,
      `Téléphone : ${order.customerPhone}`,
      `Email : ${customerEmail}`,
      `Statut : ${orderStatusLabel(order.status)}`,
      `Livraison : ${deliveryLabel(order.deliveryMethod)}`,
      `Adresse : ${address || "Non renseignée"}`,
      ...(deliveryNote ? [`Note de livraison : ${deliveryNote}`] : []),
      "",
      "Articles :",
      itemText || "- Aucun article",
      "",
      `Sous-total : ${money(order.subtotalMinor)}`,
      `Livraison : ${money(order.shippingMinor)}`,
      `Remise : ${money(order.discountMinor)}`,
      `Total : ${money(order.totalMinor)}`,
      `Paiement : ${paymentLabel(order.paymentStatus)}`,
      "",
      `Consulter la commande : ${orderUrl}`,
    ].join("\n"),
    html: `<!doctype html>
<html lang="fr">
  <body style="margin:0;background:#f7f4f1;color:#211e1b;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:32px 20px;">
      <div style="background:#ad7658;color:#fff;padding:18px 24px;">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="HBS HOME" width="104" style="display:block;width:104px;height:auto;margin:0 0 8px;background:#fff;border-radius:4px;" />` : '<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;">HBS HOME</div>'}
        <h1 style="margin:8px 0 0;font-size:24px;font-weight:600;">Nouvelle commande ${escapeHtml(order.orderNumber)}</h1>
      </div>
      <div style="background:#fff;padding:24px;">
        <p style="margin-top:0;color:#6b625c;">Reçue le ${escapeHtml(formattedDate)}</p>
        <h2 style="font-size:17px;margin:24px 0 10px;">Client</h2>
        <p style="margin:0;line-height:1.6;">${escapeHtml(order.customerName)}<br />${escapeHtml(order.customerPhone)}<br />${escapeHtml(customerEmail)}</p>
        <h2 style="font-size:17px;margin:24px 0 10px;">Livraison</h2>
        <p style="margin:0;line-height:1.6;"><strong>Statut :</strong> ${escapeHtml(orderStatusLabel(order.status))}<br />${escapeHtml(deliveryLabel(order.deliveryMethod))}<br />${escapeHtml(address || "Non renseignée")}${deliveryNote ? `<br /><strong>Note :</strong> ${escapeHtml(deliveryNote)}` : ""}</p>
        <h2 style="font-size:17px;margin:24px 0 10px;">Articles</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead><tr><th style="text-align:left;padding-bottom:8px;">Article</th><th style="padding-bottom:8px;">Qté</th><th style="text-align:right;padding-bottom:8px;">Total</th></tr></thead>
          <tbody>${itemRows || '<tr><td colspan="3">Aucun article</td></tr>'}</tbody>
        </table>
        <table style="width:100%;margin-top:18px;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:4px 0;">Sous-total</td><td style="text-align:right;">${escapeHtml(money(order.subtotalMinor))}</td></tr>
          <tr><td style="padding:4px 0;">Livraison</td><td style="text-align:right;">${escapeHtml(money(order.shippingMinor))}</td></tr>
          <tr><td style="padding:4px 0;">Remise</td><td style="text-align:right;">${escapeHtml(money(order.discountMinor))}</td></tr>
          <tr><td style="padding:12px 0 0;font-weight:700;border-top:1px solid #ddd;">Total à payer</td><td style="padding:12px 0 0;text-align:right;font-weight:700;border-top:1px solid #ddd;">${escapeHtml(money(order.totalMinor))}</td></tr>
        </table>
        <p style="margin:24px 0 0;"><a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#ad7658;color:#fff;text-decoration:none;padding:12px 18px;">Ouvrir dans le back-office</a></p>
      </div>
    </div>
  </body>
</html>`,
  };
}

function createSmtpTransport(
  environment: Environment,
): OrderEmailTransport | null {
  if (
    !environment.orderEmailNotificationsEnabled ||
    !environment.smtpUser ||
    !environment.smtpPassword
  )
    return null;

  const transporter: Transporter = nodemailer.createTransport({
    host: environment.smtpHost,
    port: environment.smtpPort,
    secure: environment.smtpPort === 465,
    requireTLS: environment.smtpPort === 587,
    auth: {
      user: environment.smtpUser,
      pass: environment.smtpPassword,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return {
    async send(message, recipients, messageId) {
      await transporter.sendMail({
        from: environment.emailFrom,
        to: recipients.map((recipient) =>
          recipient.displayName
            ? `${recipient.displayName} <${recipient.email}>`
            : recipient.email,
        ),
        subject: message.subject,
        text: message.text,
        html: message.html,
        messageId: `<${messageId}@hbs-home.com>`,
      });
    },
    close() {
      transporter.close();
    },
  };
}

function createBrevoTransport(
  environment: Environment,
): OrderEmailTransport | null {
  if (!environment.orderEmailNotificationsEnabled || !environment.brevoApiKey) {
    return null;
  }

  return {
    async send(message, recipients, messageId) {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": environment.brevoApiKey,
          "content-type": "application/json",
          // Keep retries idempotent if the API response is interrupted.
          "Idempotency-Key": messageId,
        },
        body: JSON.stringify({
          sender: { email: environment.emailFrom, name: "HBS HOME" },
          to: recipients.map((recipient) => ({
            email: recipient.email,
            ...(recipient.displayName
              ? {
                  // Brevo rejects recipient names longer than 70 characters.
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

      const responseBody = (await response.text()).trim();
      // Reading the body also releases the underlying fetch connection.
      if (response.ok) return;

      // A retried request can be reported as a duplicate after Brevo already
      // accepted the message with the same idempotency key. Treat it as sent.
      try {
        const parsed: unknown = JSON.parse(responseBody);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "code" in parsed &&
          parsed.code === "duplicate_parameter"
        ) {
          return;
        }
      } catch {
        // Keep the original response text in the error below when it is not JSON.
      }

      const detail = responseBody ? `: ${responseBody.slice(0, 500)}` : "";
      throw new Error(
        `Brevo API request failed (${String(response.status)})${detail}`,
      );
    },
    close() {
      return;
    },
  };
}

export class OrderEmailWorker {
  private readonly transport: OrderEmailTransport | null;
  private readonly rolloutAt: Date | null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private rolloutInitialized = false;

  constructor(private readonly options: OrderEmailWorkerOptions) {
    this.transport =
      createBrevoTransport(options.environment) ??
      createSmtpTransport(options.environment);
    this.rolloutAt = options.environment.orderEmailRolloutAt
      ? new Date(options.environment.orderEmailRolloutAt)
      : null;
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  start(): void {
    if (!this.transport) {
      this.options.logger.info(
        {},
        "Order email notifications are disabled or no email transport is configured",
      );
      return;
    }
    // Register the timer before any database or SMTP work so Fastify readiness
    // is never blocked by a slow/unavailable relay.
    this.timer = setInterval(
      () => void this.tick(),
      this.options.environment.orderEmailPollIntervalSeconds * 1000,
    );
    this.timer.unref();
    void this.tick();
    this.options.logger.info(
      {
        pollIntervalSeconds:
          this.options.environment.orderEmailPollIntervalSeconds,
      },
      "Order email outbox worker started",
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.transport?.close();
  }

  private async tick(): Promise<void> {
    if (!this.transport || this.running) return;
    this.running = true;
    try {
      if (!this.rolloutInitialized) {
        await this.markPreRolloutEventsProcessed();
        this.rolloutInitialized = true;
      }
      await this.requeueExpiredProcessing();
      const events = await this.claimBatch();
      for (const event of events) await this.process(event);
    } catch (error) {
      this.options.logger.error(
        { err: error },
        "Order email outbox worker cycle failed",
      );
    } finally {
      this.running = false;
    }
  }

  private async claimBatch(): Promise<
    readonly (OutboxEvent & { attempts: number })[]
  > {
    const now = new Date();
    const processingUntil = new Date(now.getTime() + PROCESSING_TIMEOUT_MS);
    const rolloutAt = this.rolloutAt;
    return this.options.database.transaction().execute(async (trx) => {
      const events = await trx
        .selectFrom("commerce.outbox_events")
        .selectAll()
        .where("status", "=", "pending")
        .where("aggregate_type", "=", "order")
        .where("event_type", "=", "order.created")
        .where("available_at", "<=", now)
        .$if(rolloutAt !== null, (query) =>
          query.where("created_at", ">=", rolloutAt ?? new Date(0)),
        )
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
    const transport = this.transport;
    if (!transport) return;
    try {
      await this.renewLease(event.id);
      const orderId = event.payload.orderId;
      if (typeof orderId !== "string" || !orderId) {
        throw new Error(
          "The order.created event has no valid orderId payload.",
        );
      }
      const order = await this.options.adminOrderRepository.getById(orderId);
      if (!order) throw new Error(`Order ${orderId} was not found.`);
      const recipients = await this.listRecipients();
      if (recipients.length === 0) {
        this.options.logger.warn(
          { orderId },
          "Order email skipped because no active orders.read recipient exists",
        );
        await this.markProcessed(event.id);
        return;
      }
      await transport.send(
        orderMessage(order, this.options.environment.adminAppUrl),
        recipients,
        `order-${order.id}`,
      );
      await this.markProcessed(event.id);
      this.options.logger.info(
        { orderId, recipientCount: recipients.length },
        "New order notification email sent",
      );
    } catch (error) {
      await this.markFailed(event, error);
    }
  }

  private async listRecipients(): Promise<readonly NotificationRecipient[]> {
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
      .where("permission.permission_key", "=", "orders.read")
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

  private async renewLease(id: string): Promise<void> {
    await this.options.database
      .updateTable("commerce.outbox_events")
      .set({
        available_at: new Date(Date.now() + PROCESSING_TIMEOUT_MS),
      })
      .where("id", "=", id)
      .where("status", "=", "processing")
      .executeTakeFirst();
  }

  private async markFailed(
    event: OutboxEvent & { attempts: number },
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const isDeadLetter =
      event.attempts >= this.options.environment.orderEmailMaxAttempts;
    const availableAt = new Date(
      Date.now() + RETRY_BASE_DELAY_MS * 2 ** Math.min(event.attempts - 1, 6),
    );
    await this.options.database
      .updateTable("commerce.outbox_events")
      .set({
        status: isDeadLetter ? "dead_letter" : "pending",
        available_at: isDeadLetter ? new Date() : availableAt,
        last_error: message.slice(0, 1000),
      })
      .where("id", "=", event.id)
      .executeTakeFirst();
    this.options.logger.error(
      {
        err: error,
        eventId: event.id,
        attempts: event.attempts,
        deadLetter: isDeadLetter,
      },
      "Order email notification failed",
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

  private async markPreRolloutEventsProcessed(): Promise<void> {
    if (!this.rolloutAt) return;
    await this.options.database
      .updateTable("commerce.outbox_events")
      .set({
        status: "processed",
        processed_at: new Date(),
        last_error: "Ignored because it predates order email rollout",
      })
      .where("status", "=", "pending")
      .where("aggregate_type", "=", "order")
      .where("event_type", "=", "order.created")
      .where("created_at", "<", this.rolloutAt)
      .executeTakeFirst();
  }
}

export function createOrderEmailWorker(
  options: OrderEmailWorkerOptions,
): OrderEmailWorker {
  return new OrderEmailWorker(options);
}

export { orderMessage };
