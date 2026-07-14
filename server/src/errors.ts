import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  type ZodFastifySchemaValidationError,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { expectedDescriptor, formatFieldPath, stringifyInput } from "./utils";
import { Prisma } from "../generated/prisma/client";

const PRISMA_KNOWN_ERROR_STATUS: Record<string, number> = {
  P2002: 409, // unique constraint violation
  P2003: 400, // foreign key constraint violation
  P2011: 400, // null constraint violation
  P2014: 400, // required relation violation
  P2025: 404, // record(s) not found
};


export class ResourceNotFoundError extends Error {
  constructor(resource?: string) {
    super(`${resource ?? "Resource"} not found.`)
  }
}

export class ResourceAlreadyExistError extends Error {
  constructor(resource: string, label: string, value: string) {
    super(`${resource.toUpperCase()} with ${label.toUpperCase()} ${value} already exists`)
  }
}

export class UserNotAllowedError extends Error {
  constructor() {
    super("User is not allowed")
  }
}

export class UnauthorizedUserError extends Error {
  constructor(message?: string) {
    super(message ?? "Unauthorized user")
  }
}

// Authenticated but not permitted to act on this specific resource. Distinct
// from UnauthorizedUserError/UserNotAllowedError (401, which the client treats
// as token-expiry and retries) — a forbidden action is a 403.
export class UserForbiddenError extends Error {
  constructor(message?: string) {
    super(message ?? "User is not allowed to access this resource")
  }
}

// Returned by @fastify/rate-limit's errorResponseBuilder (src/app.ts). Needs
// its own handler branch: the generic Error branch would surface it as 400.
export class TooManyRequestsError extends Error {
  constructor() {
    super("Too many requests. Try again in a minute.")
  }
}

type FormattedIssue = {
  path: string;
  code: string;
  expected: string;
  received: string;
  message: string;
};

function formatIssue(issue: ZodFastifySchemaValidationError): FormattedIssue {
  const params = (issue.params ?? {}) as Record<string, unknown>;
  return {
    path: formatFieldPath(issue.instancePath),
    code: issue.keyword,
    expected: expectedDescriptor(issue.keyword, params),
    received: stringifyInput(params.input),
    message: issue.message ?? "Invalid value",
  };
}

function prettyValidationMessage(issues: FormattedIssue[]): string {
  return issues
    .map((i) => `Field "${i.path}" expected ${i.expected}, received "${i.received}"`)
    .join("; ");
}

export function setErrorHandlers(app: FastifyTypedInstance) {
  app.setErrorHandler((error, request, reply) => {

    // NON-OBJECT THROWS (strings, numbers, null) — must be handled before any
    // library type guard below: `hasZodFastifySchemaValidationErrors` uses the
    // `in` operator, which throws a TypeError on primitives, crashing the
    // handler itself and leaking Fastify's default 500 body.
    if (typeof error !== "object" || error === null) {
      request.log.error(
        { thrown: error, url: request.url, method: request.method },
        `Non-Error thrown (${request.method}) ROUTE: ${request.url}`,
      );
      return reply.status(500).send({ message: "Internal server error." });
    }

    // ZOD REQUEST VALIDATION ERRORS
    if (hasZodFastifySchemaValidationErrors(error)) {
      const context = (error as { validationContext?: string }).validationContext;
      const issues = error.validation.map(formatIssue);
      const summary = prettyValidationMessage(issues);

      reply.log.error(
        { issues, context, url: request.url, method: request.method },
        `Request Validation (${request.method}) ROUTE: ${request.url} | ${summary}`,
      );
      return reply.code(400).send({
        message: `Request validation error: ${summary}`,
        context,
        errors: issues,
      });
    }

    // ZOD RESPONSE VALIDATION ERRORS
    if (isResponseSerializationError(error)) {
      const pretty = z.prettifyError(error.cause);
      reply.log.error(
        { issues: error.cause.issues, url: request.url, method: request.method },
        `Response Validation (${request.method}) ROUTE: ${request.url} | Response doesn't match schema:\n${pretty}`,
      );
      return reply.code(500).send({
        message: "Response doesn't match schema",
        errors: error.cause.issues,
      });
    }

    // UNAUTHORIZED USER (login / role authentication failures)
    if (error instanceof UnauthorizedUserError) {
      request.log.warn(
        { err: error, url: request.url, method: request.method },
        `Unauthorized User (${request.method}) ROUTE: ${request.url} | ${error.message}`,
      );
      return reply.status(401).send({ message: error.message });
    }

    // USER NOT ALLOWED (role-based authorization failures)
    if (error instanceof UserNotAllowedError) {
      request.log.warn(
        { err: error, url: request.url, method: request.method },
        `User Not Allowed (${request.method}) ROUTE: ${request.url} | ${error.message}`,
      );
      return reply.status(401).send({ message: error.message });
    }

    if (error instanceof ResourceNotFoundError) {
      request.log.warn(
        { err: error, url: request.url, method: request.method },
        `Resource not found (${request.method}) ROUTE: ${request.url} | ${error.message}`,
      );
      return reply.status(404).send({ message: error.message });
    }

    // FORBIDDEN (authenticated but not permitted for this resource)
    if (error instanceof UserForbiddenError) {
      request.log.warn(
        { err: error, url: request.url, method: request.method },
        `User Forbidden (${request.method}) ROUTE: ${request.url} | ${error.message}`,
      );
      return reply.status(403).send({ message: error.message });
    }

    if (error instanceof ResourceAlreadyExistError) {
      request.log.warn(
        { err: error, url: request.url, method: request.method },
        `Resource already exists (${request.method}) ROUTE: ${request.url} | ${error.message}`,
      );
      return reply.status(409).send({ message: error.message });
    }

    // PRISMA CLIENT ERRORS
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const status = PRISMA_KNOWN_ERROR_STATUS[error.code] ?? 400;
      request.log.error(
        { code: error.code, meta: error.meta, clientVersion: error.clientVersion, url: request.url, method: request.method },
        `Prisma Known Error (${request.method}) ROUTE: ${request.url} | ${error.code} | ${error.message}`,
      );
      return reply.status(status).send({
        message: `Database request error (${error.code}).`,
        code: error.code,
        meta: error.meta,
      });
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      request.log.error(
        { clientVersion: error.clientVersion, url: request.url, method: request.method },
        `Prisma Validation Error (${request.method}) ROUTE: ${request.url} | ${error.message}`,
      );
      return reply.status(400).send({ message: "Invalid database query payload." });
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      request.log.error(
        { errorCode: error.errorCode, clientVersion: error.clientVersion, url: request.url, method: request.method },
        `Prisma Initialization Error (${request.method}) ROUTE: ${request.url} | ${error.message}`,
      );
      return reply.status(503).send({ message: "Database is unavailable." });
    }

    if (
      error instanceof Prisma.PrismaClientRustPanicError ||
      error instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      request.log.error(
        { err: error, url: request.url, method: request.method },
        `Prisma Engine Error (${request.method}) ROUTE: ${request.url} | ${error.message}`,
      );
      return reply.status(500).send({ message: "Internal database error." });
    }

    // RATE LIMITED
    if (error instanceof TooManyRequestsError) {
      request.log.warn(
        { url: request.url, method: request.method, ip: request.ip },
        `Rate Limited (${request.method}) ROUTE: ${request.url}`,
      );
      return reply.status(429).send({ message: error.message });
    }

    // General Error handling

    if (error instanceof Error) {
      request.log.error(`General Error (${request.method}) ROUTE: ${request.url} | ${error.message}`)
      return reply.status(400).send({ message: error.message });
    }

    reply.log.error(error);
    return reply.status(500).send({ message: "Internal server error." });
  });
}
