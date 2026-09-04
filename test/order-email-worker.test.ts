import { describe, expect, it } from "vitest";
import type { AdminOrder } from "../src/orders/admin-order-repository.js";
import { orderMessage } from "../src/notifications/order-email-worker.js";

const order: AdminOrder = {
  id: "order-123",
  orderNumber: "HBS-20260903-0001",
  createdAt: "2026-09-03T10:15:00.000Z",
  updatedAt: "2026-09-03T10:15:00.000Z",
  status: "pending_confirmation",
  paymentStatus: "pending",
  paymentMethod: "cash_on_delivery",
  customerId: "customer-123",
  customerName: "Nadia <test>",
  customerPhone: "22 123 456",
  customerEmail: "nadia@example.com",
  deliveryMethod: "home_delivery",
  governorate: "Tunis",
  city: "La Marsa",
  postalCode: "2070",
  addressLine: "12 rue des Fleurs",
  landmark: "Près de la poste",
  deliveryNote: null,
  items: [
    {
      productId: "product-123",
      variantId: "variant-123",
      productName: "Rideau Lin",
      variantLabel: "Naturel",
      sku: "LIN-001-VAR-01",
      quantity: 2,
      unitPriceMinor: 45000,
      lineTotalMinor: 90000,
      productReference: "LIN-001",
      productSlug: "rideau-lin",
      imageUrl: "https://cdn.example.com/rideau.webp",
      imageAlt: "Rideau en lin",
      selectedOptions: [],
      sellingUnitLabel: "Panneau",
      shippingProfile: null,
    },
  ],
  subtotalMinor: 90000,
  shippingMinor: 8000,
  discountMinor: 0,
  totalMinor: 98000,
  timeline: [],
  notes: [],
  returnInfo: null,
  shipment: {
    shippingStatus: "to_confirm",
    shippingFeeMinor: 8000,
  },
};

describe("order email message", () => {
  it("contains the order details and a deep link to Admin", () => {
    const message = orderMessage(order, "https://preview.hbs-home.com/");

    expect(message.subject).toContain("HBS-20260903-0001");
    expect(message.text).toContain("Nadia <test>");
    expect(message.text).toContain("Créée le : 3 septembre 2026 à 11:15 AM");
    expect(message.text).toContain("Rideau Lin");
    expect(message.text).toContain("LIN-001-VAR-01");
    expect(message.text).toContain(
      "https://preview.hbs-home.com/admin/commandes/order-123",
    );
    expect(message.html).toContain("Nadia &lt;test&gt;");
    expect(message.html).toContain("Reçue le 3 septembre 2026 à 11:15 AM");
    expect(message.html).toContain(
      '<img src="https://preview.hbs-home.com/apple-touch-icon.png"',
    );
    expect(message.html).toContain('alt="HBS HOME"');
    expect(message.html).toContain("Rideau Lin");
    expect(message.html).toContain(
      '<img src="https://cdn.example.com/rideau.webp"',
    );
    expect(message.html).toContain('alt="Rideau en lin"');
    expect(message.html).toContain(
      "https://preview.hbs-home.com/admin/commandes/order-123",
    );
  });

  it("does not include a trailing slash in the Admin deep link", () => {
    const message = orderMessage(order, "https://preview.hbs-home.com////");

    expect(message.text).toContain(
      "https://preview.hbs-home.com/admin/commandes/order-123",
    );
  });

  it("makes relative product images renderable in email clients", () => {
    const item = order.items[0];
    if (!item) throw new Error("The order fixture must contain an item.");

    const message = orderMessage(
      {
        ...order,
        items: [{ ...item, imageUrl: "/catalog/rideau.jpg" }],
      },
      "https://preview.hbs-home.com/",
    );

    expect(message.html).toContain(
      '<img src="https://preview.hbs-home.com/catalog/rideau.jpg"',
    );
  });
});
