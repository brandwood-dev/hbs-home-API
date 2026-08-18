import { Type, type Static } from "@sinclair/typebox";

export const ProblemDetailSchema = Type.Object(
  {
    type: Type.String(),
    title: Type.String(),
    status: Type.Integer({ minimum: 400, maximum: 599 }),
    detail: Type.String(),
    instance: Type.String(),
    code: Type.String(),
    requestId: Type.String(),
    errors: Type.Optional(
      Type.Array(
        Type.Object(
          {
            path: Type.String(),
            message: Type.String(),
            keyword: Type.String(),
          },
          { additionalProperties: false },
        ),
      ),
    ),
  },
  { $id: "ProblemDetail", additionalProperties: false },
);

export type ProblemDetail = Static<typeof ProblemDetailSchema>;

export interface AppErrorOptions {
  statusCode: number;
  code: string;
  title: string;
  detail: string;
  type?: string;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly title: string;
  readonly type: string;

  constructor(options: AppErrorOptions) {
    super(options.detail);
    this.name = "AppError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.title = options.title;
    this.type =
      options.type ??
      `https://api.hbs-home.com/problems/${options.code.toLowerCase()}`;
  }
}
