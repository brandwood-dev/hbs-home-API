import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ProblemDetailSchema } from "../http/problem.js";
import type {
  FavoritesRepository,
  FavoritesView,
} from "../favorites/favorites-repository.js";

const FavoriteItemSchema = Type.Object(
  {
    productId: Type.String(),
    addedAt: Type.String({ format: "date-time" }),
    product: Type.Ref("Product"),
    isAvailable: Type.Boolean(),
  },
  { additionalProperties: false },
);

const FavoritesSchema = Type.Object(
  {
    items: Type.Array(FavoriteItemSchema),
    removedProductIds: Type.Array(Type.String()),
    count: Type.Integer({ minimum: 0 }),
  },
  { $id: "Favorites", additionalProperties: false },
);

const FavoriteBody = Type.Object(
  { productId: Type.String({ minLength: 1, maxLength: 160 }) },
  { additionalProperties: false },
);
const FavoriteParams = Type.Object(
  { productId: Type.String({ minLength: 1, maxLength: 160 }) },
  { additionalProperties: false },
);

type FavoriteBodyType = Static<typeof FavoriteBody>;
type FavoriteParamsType = Static<typeof FavoriteParams>;

function cookieToken(request: FastifyRequest): string | null {
  const cookie = request.headers.cookie;
  if (!cookie) return null;
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("hbs_favorites_token="));
  if (!value) return null;
  try {
    return decodeURIComponent(value.slice("hbs_favorites_token=".length));
  } catch {
    return null;
  }
}

function setFavoritesCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
): void {
  const isHbsHomeHost =
    request.hostname === "hbs-home.com" ||
    request.hostname.endsWith(".hbs-home.com");
  const secure = request.protocol === "https" || isHbsHomeHost;
  const domain = isHbsHomeHost ? "; Domain=.hbs-home.com" : "";
  reply.header(
    "set-cookie",
    `hbs_favorites_token=${encodeURIComponent(token)}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}${domain}`,
  );
  reply.header("cache-control", "no-store");
}

function sendFavorites(
  reply: FastifyReply,
  session: { token: string; favorites: FavoritesView },
): FavoritesView {
  setFavoritesCookie(reply.request, reply, session.token);
  return session.favorites;
}

export interface FavoritesRouteDependencies {
  favoritesRepository: FavoritesRepository;
}

export function registerFavoritesRoutes(
  app: FastifyInstance,
  dependencies: FavoritesRouteDependencies,
): void {
  app.addSchema(FavoritesSchema);

  app.get(
    "/api/v1/favorites",
    {
      schema: {
        operationId: "getFavorites",
        summary: "Read the current opaque-token guest favorites",
        tags: ["favorites"],
        response: { 200: FavoritesSchema, 500: ProblemDetailSchema },
      },
    },
    async (request, reply) =>
      sendFavorites(
        reply,
        await dependencies.favoritesRepository.get(cookieToken(request)),
      ),
  );

  app.post<{ Body: FavoriteBodyType }>(
    "/api/v1/favorites/items",
    {
      schema: {
        operationId: "addFavorite",
        summary: "Add a published product to guest favorites",
        tags: ["favorites"],
        body: FavoriteBody,
        response: {
          200: FavoritesSchema,
          400: ProblemDetailSchema,
          404: ProblemDetailSchema,
          409: ProblemDetailSchema,
        },
      },
    },
    async (request, reply) =>
      sendFavorites(
        reply,
        await dependencies.favoritesRepository.add(
          cookieToken(request),
          request.body.productId,
        ),
      ),
  );

  app.delete<{ Params: FavoriteParamsType }>(
    "/api/v1/favorites/items/:productId",
    {
      schema: {
        operationId: "removeFavorite",
        summary: "Remove a product from guest favorites",
        tags: ["favorites"],
        params: FavoriteParams,
        response: { 200: FavoritesSchema, 400: ProblemDetailSchema },
      },
    },
    async (request, reply) =>
      sendFavorites(
        reply,
        await dependencies.favoritesRepository.remove(
          cookieToken(request),
          request.params.productId,
        ),
      ),
  );

  app.delete(
    "/api/v1/favorites",
    {
      schema: {
        operationId: "clearFavorites",
        summary: "Clear all guest favorites",
        tags: ["favorites"],
        response: { 200: FavoritesSchema },
      },
    },
    async (request, reply) =>
      sendFavorites(
        reply,
        await dependencies.favoritesRepository.clear(cookieToken(request)),
      ),
  );
}
