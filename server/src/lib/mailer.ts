import { env } from "@/env";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface MailDriver {
  send(message: MailMessage): Promise<void>;
}

// Dev/placeholder driver: the "sent" email (including any tokenized link) goes
// to stdout instead of an inbox. console (not app.log) on purpose — the app
// imports the auth handlers which import this module, so importing the app
// back here would be circular.
const logDriver: MailDriver = {
  async send(message) {
    if (env.NODE_ENV === "test") return;
    console.info(
      `[mailer] ${message.subject} -> ${message.to}\n${message.text}`,
    );
  },
};

const drivers: Record<typeof env.MAIL_DRIVER, MailDriver> = {
  log: logDriver,
};

// Singleton object (not a bare function) so specs can vi.spyOn(mailer, "send")
// to capture raw tokens — they are hashed at rest, the mail is the only copy.
export const mailer = {
  async send(message: MailMessage) {
    await drivers[env.MAIL_DRIVER].send(message);
  },
};

export async function sendEmailConfirmation(params: {
  to: string;
  name: string;
  confirmUrl: string;
}) {
  await mailer.send({
    to: params.to,
    subject: "Confirme seu email na Luup",
    text:
      `Olá ${params.name},\n\n` +
      `Confirme seu email para ativar sua conta na Luup:\n\n` +
      `${params.confirmUrl}\n\n` +
      `O link expira em 24 horas. Se você não criou esta conta, ignore este email.`,
  });
}

export async function sendPasswordReset(params: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  await mailer.send({
    to: params.to,
    subject: "Redefinição de senha na Luup",
    text:
      `Olá ${params.name},\n\n` +
      `Recebemos um pedido para redefinir sua senha. Use o link abaixo:\n\n` +
      `${params.resetUrl}\n\n` +
      `O link expira em 1 hora. Se você não pediu a redefinição, ignore este email.`,
  });
}
