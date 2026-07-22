import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    async (error: FastifyError | ZodError, request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof ZodError) {
        const response: ErrorResponse = {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed.",
            requestId: request.id,
            details: error.flatten(),
          },
        };

        await reply.code(400).send(response);
        return;
      }

      if (error instanceof AppError) {
        const response: ErrorResponse = {
          error: {
            code: error.code,
            message: error.message,
            requestId: request.id,
            details: error.details,
          },
        };

        await reply.code(error.statusCode).send(response);
        return;
      }

      const statusCode = normalizeStatusCode(error.statusCode);
      const code = statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR";

      request.log.error(
        {
          err: error,
          statusCode,
          requestId: request.id,
        },
        "Request failed",
      );

      const response: ErrorResponse = {
        error: {
          code,
          message: statusCode >= 500 ? "Unexpected server error." : error.message,
          requestId: request.id,
        },
      };

      await reply.code(statusCode).send(response);
    },
  );

  app.setNotFoundHandler(async (request, reply) => {
    await reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} was not found.`,
        requestId: request.id,
      },
    } satisfies ErrorResponse);
  });
}

function normalizeStatusCode(statusCode: number | undefined): number {
  if (!statusCode || statusCode < 400 || statusCode > 599) {
    return 500;
  }

  return statusCode;
}
