import { fastify } from "fastify"
import fastifyJwt from "@fastify/jwt"
import fastifyCookie from "@fastify/cookie"
import fastifyRateLimit from "@fastify/rate-limit"
import { fastifyCors } from "@fastify/cors"
import fastifySwagger from "@fastify/swagger"
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod"
import { fastifySwaggerUi } from "@fastify/swagger-ui"
import { env } from "./env"
import { loggerHandlers } from "./logger"
import { registerRoutes } from "./routes"
import { setErrorHandlers, TooManyRequestsError } from "@/errors"

const isProduction = env.NODE_ENV === "production"

export const app = fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
    // Never let bearer tokens or the refreshToken cookie reach the logs.
    redact: {
      paths: [
        // Fastify req serializer shape ("req.headers.*") and the manual
        // request-start/end logs in logger.ts (top-level "headers.*").
        "req.headers.authorization",
        "req.headers.cookie",
        "headers.authorization",
        "headers.cookie",
      ],
      censor: "[redacted]",
    },
    serializers: {
      res(res) {
        return {
          statusCode: res.statusCode,
          headers:
            typeof res.getHeaders === "function" ? res.getHeaders() : {},
        };
      },
      req(request) {
        return {
          method: request.method,
          url: request.url,
          path: request.routeOptions?.url,
          parameters: request.params,
          headers: request.headers,
          remoteAddress: request.ip,
          remotePort: request.socket.remotePort,
          user: request.user
        };
      },
    },
    // pino-pretty is a dev-only formatter (per-line cost + worker thread); emit
    // raw JSON in production.
    ...(isProduction
      ? {}
      : {
        transport: {
          targets: [
            {
              target: "pino-pretty",
              level: "error",
              options: {
                name: "dev-terminal",
                colorize: true,
                levelFirst: true,
                include: "level,time,msg,err",
                translateTime: "yyyy-mm-dd HH:MM:ss Z",
              },
            },
          ],
        },
      }),
  },
  disableRequestLogging: true, // Disable Fastify's default request logs
  // Behind one reverse-proxy hop request.ip follows X-Forwarded-For, which the
  // rate limiter keys on (and the rate-limit spec relies on to forge clients).
  trustProxy: 1,
})

loggerHandlers(app)

app.setValidatorCompiler(validatorCompiler)
app.setSerializerCompiler(serializerCompiler)

// const corsOrigins: (string | RegExp)[] = [
//   "https://playluup.com.br",
//   "https://luup.dzns.com.br",
//   "https://luup.dzns.net",
// ]
// if (!isProduction) {
//   corsOrigins.push(/^http:\/\/localhost:\d+$/)
//   corsOrigins.push(/^http:\/\/127\.0\.0\.1:\d+$/)
// }

app.register(fastifyCors, {
  origin: true,
  methods: ["GET", "PUT", "POST", "PATCH", "DELETE"],
  credentials: true,
})

app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Lupp API",
      version: "0.1",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  transform: jsonSchemaTransform,
})

app.register(fastifySwaggerUi, {
  routePrefix: "/docs",
})

app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
  cookie: {
    cookieName: "refreshToken",
    signed: false,
  },
  sign: {
    expiresIn: "15m",
  },
})

app.register(fastifyCookie)

// Not global: only routes that declare config.rateLimit (the auth surface —
// the brute-force target) are throttled. Loopback is exempt in tests so
// ordinary supertest traffic never trips a limit; the rate-limit spec forges
// X-Forwarded-For to opt back in.
const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])
app.register(fastifyRateLimit, {
  global: false,
  allowList: (request) => env.NODE_ENV === "test" && LOOPBACK_IPS.has(request.ip),
  // Thrown by the plugin and mapped to 429 by setErrorHandlers.
  errorResponseBuilder: () => new TooManyRequestsError(),
})

registerRoutes(app)
setErrorHandlers(app)
