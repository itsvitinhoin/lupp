import { FastifyReply, FastifyRequest } from "fastify"

export async function verifyJwt(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.log.error(err, "JWT authentication error")
    return reply.status(401).send({ message: "Failed to verify session token."})
  }
}
