import { FastifyTypedInstance } from "@/@types/fastify-type-instance";
import { env } from "@/env";
import { verifyJwt } from "@/middlewares/verify-jwt";
import { signUpHandler, SignUpSchema } from "./sign-up";
import { signInHandler, SignInSchema } from "./sign-in";
import { refreshHandler, RefreshSchema } from "./refresh";
import { signOutHandler, SignOutSchema } from "./sign-out";
import { meHandler, MeSchema } from "./me";
import { confirmEmailHandler, ConfirmEmailSchema } from "./confirm-email";
import { resendConfirmationHandler, ResendConfirmationSchema } from "./resend-confirmation";
import { resetPasswordHandler, ResetPasswordSchema } from "./reset-password";
import { resetPasswordConfirmHandler, ResetPasswordConfirmSchema } from "./reset-password-confirm";

// Stricter per-route limits than anywhere else in the API — these endpoints
// are the brute-force / enumeration surface. The plugin is registered with
// global: false (src/app.ts), so only routes carrying config.rateLimit are
// throttled.
const perMinute = (max: number) => ({ rateLimit: { max, timeWindow: "1m" } });

export async function AuthRoutes(app: FastifyTypedInstance) {
  app.post(
    "/api/auth/sign-up",
    { schema: SignUpSchema.schema, config: perMinute(10) },
    signUpHandler,
  );

  app.post(
    "/api/auth/sessions",
    { schema: SignInSchema.schema, config: perMinute(env.RATE_LIMIT_LOGIN_MAX) },
    signInHandler,
  );

  app.patch(
    "/api/auth/sessions/refresh",
    { schema: RefreshSchema.schema, config: perMinute(30) },
    refreshHandler,
  );

  app.delete(
    "/api/auth/sessions",
    { schema: SignOutSchema.schema, config: perMinute(30) },
    signOutHandler,
  );

  app.get(
    "/api/auth/me",
    { schema: MeSchema.schema, preHandler: [verifyJwt] },
    meHandler,
  );

  app.get(
    "/api/auth/confirm-email",
    { schema: ConfirmEmailSchema.schema, config: perMinute(30) },
    confirmEmailHandler,
  );

  app.post(
    "/api/auth/resend-confirmation",
    { schema: ResendConfirmationSchema.schema, config: perMinute(5) },
    resendConfirmationHandler,
  );

  app.post(
    "/api/auth/reset-password",
    { schema: ResetPasswordSchema.schema, config: perMinute(5) },
    resetPasswordHandler,
  );

  app.post(
    "/api/auth/reset-password/confirm",
    { schema: ResetPasswordConfirmSchema.schema, config: perMinute(10) },
    resetPasswordConfirmHandler,
  );
}
