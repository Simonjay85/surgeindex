import "server-only";

import { getServerEnv } from "@surge/config";

type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/** Keep provider credentials and verification/reset URLs server-side. */
export async function sendTransactionalEmail(input: TransactionalEmail): Promise<void> {
  const env = getServerEnv();
  if (env.EMAIL_PROVIDER === "disabled") throw new Error("transactional_email_not_configured");
  if (env.EMAIL_PROVIDER === "console") {
    console.info("[surgeindex] transactional email accepted", { provider: "console", to: input.to, subject: input.subject });
    return;
  }
  if (!env.EMAIL_HTTP_URL || !env.EMAIL_HTTP_API_KEY || !env.EMAIL_FROM) throw new Error("transactional_email_not_configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EMAIL_HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(env.EMAIL_HTTP_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.EMAIL_HTTP_API_KEY}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        replyTo: env.EMAIL_REPLY_TO,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("transactional_email_provider_failed");
  } finally {
    clearTimeout(timeout);
  }
}
