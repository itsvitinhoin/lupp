import jwt from "jsonwebtoken"
import { FastifyTypedInstance } from "@/@types/fastify-type-instance";

export function loggerHandlers(app: FastifyTypedInstance) {
  app.addHook("onRequest", (req, _reply, done) => {
    const authHeader = req.headers["authorization"]
    let decodedJwt: ReturnType<typeof jwt.decode> = null
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1]
      try {
        decodedJwt = jwt.decode(token)
      } catch (err) {
        req.log.warn({ err }, "Failed to decode JWT")
      }
    }
    const payload = decodedJwt && typeof decodedJwt === "object" ? decodedJwt : null
    const sub = payload?.sub ?? null
    const role = (payload as { role?: string } | null)?.role ?? null
    req.log.info(
      {
        event: "request-start",
        service: "lupp-server",
        method: req.method,
        url: req.url,
        path: req.routeOptions?.url,
        params: req.params,
        query: req.query,
        clientIp: req.ip,
        headers: req.headers,
        user: { sub, role },
      },
      `Request START (${req.method}) - ROUTE: ${req.routeOptions?.url} / USER : ${sub ?? "none"} / ROLE: ${role ?? "none"} - ${req.ip}`,
    )
    done()
  })

  app.addHook("onResponse", (req, reply, done) => {
    const elapsed = Math.round(reply.elapsedTime)
    const elapsedColored = `\x1b[32m${elapsed} ms\x1b[0m`
    req.log.info(
      {
        event: "request-end",
        service: "lupp-server",
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
        responseTime: elapsed,
      },
      `Request END (${req.method} - ${reply.statusCode}) - ROUTE: ${req.routeOptions?.url} - ${elapsedColored}`,
    )
    done()
  })
}
