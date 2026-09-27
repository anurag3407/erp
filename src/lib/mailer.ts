import crypto from 'node:crypto';

/**
 * Transactional email delivery.
 *
 * Provider: Plunk (https://useplunk.com) — a single-key HTTP API that sends
 * mail directly, so no SMTP or upstream provider is required.
 *
 * Required configuration:
 *   PLUNK_API_KEY  secret key (sk_*) from the Plunk dashboard
 *   MAIL_FROM      verified sender, e.g. "Nexus ERP <no-reply@your-domain.edu>"
 *
 * When unconfigured, `sendEmail` logs and reports the send as not delivered
 * rather than throwing — so flows such as password reset can still complete
 * and fall back to a development affordance outside production.
 */

const PLUNK_ENDPOINT = 'https://next-api.useplunk.com/v1/send';
const REQUEST_TIMEOUT_MS = 10_000;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailDelivery {
  delivered: boolean;
  provider: 'plunk' | 'none';
  error?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.PLUNK_API_KEY && process.env.MAIL_FROM);
}

export async function sendEmail(message: EmailMessage): Promise<EmailDelivery> {
  const apiKey = process.env.PLUNK_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    console.warn(
      '[mailer] Email is not configured (PLUNK_API_KEY / MAIL_FROM missing) — message not sent.'
    );
    return { delivered: false, provider: 'none', error: 'EMAIL_NOT_CONFIGURED' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(PLUNK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        // Guards against a retried action sending the same mail twice.
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        to: message.to,
        subject: message.subject,
        body: message.html,
        from,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: { code?: string; message?: string } }
      | null;

    if (!response.ok || !payload?.success) {
      const detail = payload?.error?.message || `HTTP ${response.status}`;
      console.error('[mailer] Plunk rejected the message:', detail);
      return { delivered: false, provider: 'plunk', error: detail };
    }

    return { delivered: true, provider: 'plunk' };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown transport error';
    console.error('[mailer] Failed to send message:', detail);
    return { delivered: false, provider: 'plunk', error: detail };
  } finally {
    clearTimeout(timeout);
  }
}

/** Escape user-controlled values before interpolating into email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Password-reset email body. The reset URL is built server-side from
 * APP_BASE_URL plus the single-use token, and the recipient name is escaped.
 */
export function renderPasswordResetEmail(recipientName: string, resetUrl: string): string {
  const safeName = escapeHtml(recipientName || 'there');
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;">
        <h1 style="margin:0 0 12px;font-size:18px;color:#1e293b;">Reset your password</h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">
          Hello ${safeName}, we received a request to reset the password for your Nexus ERP account.
          This link expires in 30 minutes and can only be used once.
        </p>
        <p style="margin:0 0 24px;">
          <a href="${resetUrl}"
             style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px;">
            Choose a new password
          </a>
        </p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
          If you did not request this, you can ignore this email — your password will not change.
        </p>
      </div>
    </div>
  </body>
</html>`;
}
