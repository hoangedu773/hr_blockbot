import { AccountEmailSchema } from "@hr-blockbot/contracts";
import { WorkflowError } from "./project-workflow.service.js";

export function deliverableAccountEmail(value: unknown): string | null {
  const result = AccountEmailSchema.safeParse(value);
  return result.success && !result.data.endsWith(".invalid") ? result.data : null;
}

export type AccountMail = (message: { to: string; subject: string; body: string }) => Promise<void>;

export function gmailAccountMail(): AccountMail | undefined {
  const from = deliverableAccountEmail(process.env.ACCOUNT_MAIL_FROM);
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (!from || !clientId || !clientSecret || !refreshToken) return;

  return async ({ to, subject, body }) => {
    const recipient = deliverableAccountEmail(to);
    if (!recipient) throw new WorkflowError(422, "ACCOUNT_EMAIL_REQUIRED", "Chưa có email nhận hợp lệ.");
    const access = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(6000),
    });
    const credentials = access.ok ? await access.json() as { access_token?: string } : {};
    if (!credentials.access_token) throw new Error("Gmail authorization failed");
    const base64 = (value: string) => Buffer.from(value, "utf8").toString("base64");
    const bodyLines = base64(body).match(/.{1,76}/g)?.join("\r\n") ?? "";
    const raw = Buffer.from([
      `From: ${from}`, `To: ${recipient}`, `Subject: =?UTF-8?B?${base64(subject)}?=`,
      "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64", "", bodyLines, "",
    ].join("\r\n")).toString("base64url");
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Gmail delivery failed");
  };
}
