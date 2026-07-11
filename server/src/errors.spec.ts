import { afterEach, describe, expect, it } from "vitest";
import { fastify, type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import {
  ResourceAlreadyExistError,
  ResourceNotFoundError,
  UnauthorizedUserError,
  UserForbiddenError,
  UserNotAllowedError,
  setErrorHandlers,
} from "./errors";
import type { FastifyTypedInstance } from "@/@types/fastify-type-instance";

function buildApp(register: (app: FastifyTypedInstance) => void): FastifyInstance {
  const app = fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  setErrorHandlers(app as unknown as FastifyTypedInstance);
  register(app as unknown as FastifyTypedInstance);
  return app;
}

describe("ResourceNotFoundError", () => {
  it("defaults to a generic message when no resource is supplied", () => {
    const error = new ResourceNotFoundError();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Resource not found.");
  });

  it("includes the named resource in the message", () => {
    const error = new ResourceNotFoundError("Video");
    expect(error.message).toBe("Video not found.");
  });
});

describe("UserNotAllowedError", () => {
  it("has a fixed message", () => {
    const error = new UserNotAllowedError();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("User is not allowed");
  });
});

describe("setErrorHandlers", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("handles Zod request validation errors as 400 with structured issues", async () => {
    app = buildApp((instance) => {
      instance.post(
        "/echo",
        { schema: { body: z.object({ name: z.string() }) } },
        async (_req, reply) => reply.send({ ok: true }),
      );
    });

    const res = await app.inject({ method: "POST", url: "/echo", payload: {} });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toContain("Request validation error");
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors[0]).toMatchObject({ path: "name" });
  });

  it("handles Zod response validation errors as 500", async () => {
    app = buildApp((instance) => {
      instance.get(
        "/bad",
        { schema: { response: { 200: z.object({ name: z.string() }) } } },
        async (_req, reply) => reply.send({ name: 42 } as unknown as { name: string }),
      );
    });

    const res = await app.inject({ method: "GET", url: "/bad" });
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toBe("Response doesn't match schema");
  });

  it("maps UnauthorizedUserError to 401", async () => {
    app = buildApp((instance) => {
      instance.get("/me", async () => {
        throw new UnauthorizedUserError("User is disabled.");
      });
    });

    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ message: "User is disabled." });
  });

  it("maps UserNotAllowedError to 401", async () => {
    app = buildApp((instance) => {
      instance.get("/not-allowed", async () => {
        throw new UserNotAllowedError();
      });
    });

    const res = await app.inject({ method: "GET", url: "/not-allowed" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ message: "User is not allowed" });
  });

  it("maps UserForbiddenError to 403", async () => {
    app = buildApp((instance) => {
      instance.get("/forbidden", async () => {
        throw new UserForbiddenError();
      });
    });

    const res = await app.inject({ method: "GET", url: "/forbidden" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      message: "User is not allowed to access this resource",
    });
  });

  it("maps ResourceNotFoundError to 404", async () => {
    app = buildApp((instance) => {
      instance.get("/videos/:id", async () => {
        throw new ResourceNotFoundError("Video");
      });
    });

    const res = await app.inject({ method: "GET", url: "/videos/123" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ message: "Video not found." });
  });

  it("maps ResourceAlreadyExistError to 409", async () => {
    app = buildApp((instance) => {
      instance.post("/users", async () => {
        throw new ResourceAlreadyExistError("User", "email", "ada@example.com");
      });
    });

    const res = await app.inject({ method: "POST", url: "/users", payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain("already exists");
  });

  it("maps Prisma P2002 (unique constraint) to 409", async () => {
    app = buildApp((instance) => {
      instance.get("/dup", async () => {
        throw new Prisma.PrismaClientKnownRequestError(
          "Unique constraint failed on the fields: (`email`)",
          { code: "P2002", clientVersion: "test", meta: { target: ["email"] } },
        );
      });
    });

    const res = await app.inject({ method: "GET", url: "/dup" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      code: "P2002",
      meta: { target: ["email"] },
    });
  });

  it("maps Prisma P2025 (record not found) to 404", async () => {
    app = buildApp((instance) => {
      instance.get("/missing", async () => {
        throw new Prisma.PrismaClientKnownRequestError("not found", {
          code: "P2025",
          clientVersion: "test",
        });
      });
    });

    const res = await app.inject({ method: "GET", url: "/missing" });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("P2025");
  });

  it("falls back to 400 for unmapped Prisma known error codes", async () => {
    app = buildApp((instance) => {
      instance.get("/other", async () => {
        throw new Prisma.PrismaClientKnownRequestError("unexpected", {
          code: "P9999",
          clientVersion: "test",
        });
      });
    });

    const res = await app.inject({ method: "GET", url: "/other" });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("P9999");
  });

  it("maps PrismaClientValidationError to 400 with a generic message", async () => {
    app = buildApp((instance) => {
      instance.get("/bad-query", async () => {
        throw new Prisma.PrismaClientValidationError("query shape is wrong", {
          clientVersion: "test",
        });
      });
    });

    const res = await app.inject({ method: "GET", url: "/bad-query" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ message: "Invalid database query payload." });
  });

  it("maps PrismaClientInitializationError to 503", async () => {
    app = buildApp((instance) => {
      instance.get("/init", async () => {
        throw new Prisma.PrismaClientInitializationError(
          "cannot connect",
          "test",
          "P1001",
        );
      });
    });

    const res = await app.inject({ method: "GET", url: "/init" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ message: "Database is unavailable." });
  });

  it("maps PrismaClientRustPanicError to 500", async () => {
    app = buildApp((instance) => {
      instance.get("/panic", async () => {
        throw new Prisma.PrismaClientRustPanicError("engine panic", "test");
      });
    });

    const res = await app.inject({ method: "GET", url: "/panic" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ message: "Internal database error." });
  });

  it("maps PrismaClientUnknownRequestError to 500", async () => {
    app = buildApp((instance) => {
      instance.get("/unknown", async () => {
        throw new Prisma.PrismaClientUnknownRequestError("opaque failure", {
          clientVersion: "test",
        });
      });
    });

    const res = await app.inject({ method: "GET", url: "/unknown" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ message: "Internal database error." });
  });

  it("returns 400 with the message for an unrecognized Error", async () => {
    app = buildApp((instance) => {
      instance.get("/generic", async () => {
        throw new Error("something blew up");
      });
    });

    const res = await app.inject({ method: "GET", url: "/generic" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ message: "something blew up" });
  });

  it("returns a generic 500 for non-Error thrown values", async () => {
    app = buildApp((instance) => {
      instance.get("/weird", async () => {
        throw "a string, not an Error";
      });
    });

    const res = await app.inject({ method: "GET", url: "/weird" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ message: "Internal server error." });
  });
});
