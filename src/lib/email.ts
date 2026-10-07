/**
 * Transactional email via Resend. No-ops safely when RESEND_API_KEY is absent,
 * so the app never breaks — it just skips the email until a key is configured.
 *
 * Every email is bilingual: German first (the app default), then English.
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "TyloTech <notifications@tylotech.de>";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "info@tylotech.de";
const APP_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://tylotech-hub.vercel.app").replace(/\/$/, "");

export const emailConfigured = Boolean(RESEND_API_KEY);

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function send(
  to: string,
  subject: string,
  html: string,
  attachments?: { filename: string; content: string }[],
): Promise<boolean> {
  if (!RESEND_API_KEY || !to) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html, reply_to: EMAIL_REPLY_TO, ...(attachments ? { attachments } : {}) }),
  }).catch(() => null);
  return !!res?.ok;
}

interface ChatEmail {
  senderName: string;
  preview: string;
  /** App path (e.g. /chat) or absolute URL. */
  href: string;
  isFile?: boolean;
}

/** Bilingual (DE + EN) email for a new chat message or file. */
export async function sendChatEmail(to: string, e: ChatEmail): Promise<void> {
  if (!emailConfigured) return;
  const url = e.href.startsWith("http") ? e.href : `${APP_URL}${e.href}`;
  const sender = esc(e.senderName);
  const preview = esc(e.preview).slice(0, 300);

  const de = e.isFile
    ? { subject: `Neue Datei von ${e.senderName}`, lead: `${sender} hat Ihnen eine Datei in Ihrem TyloTech-Portal gesendet:`, cta: "Datei öffnen" }
    : { subject: `Neue Nachricht von ${e.senderName}`, lead: `${sender} hat Ihnen eine neue Nachricht in Ihrem TyloTech-Portal gesendet:`, cta: "Nachricht öffnen" };
  const en = e.isFile
    ? { subject: `New file from ${e.senderName}`, lead: `${sender} sent you a file in your TyloTech portal:`, cta: "Open file" }
    : { subject: `New message from ${e.senderName}`, lead: `${sender} sent you a new message in your TyloTech portal:`, cta: "Open message" };

  const subject = `${de.subject} · ${en.subject}`;
  const button = (label: string) =>
    `<a href="${url}" style="display:inline-block;background:#C9A84C;color:#111;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:10px;font-size:14px">${label} →</a>`;
  const quote = `<div style="border-left:3px solid #C9A84C;background:#faf7ee;padding:12px 16px;border-radius:8px;color:#333;font-size:15px;line-height:1.5;margin:10px 0 18px">${preview || "…"}</div>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5">
      <tr><td style="padding:20px 28px;border-bottom:1px solid #eee">
        <span style="font-size:17px;font-weight:700;color:#111">Tylo<span style="color:#C9A84C">Tech</span></span>
      </td></tr>
      <tr><td style="padding:24px 28px 8px">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#999">Deutsch</p>
        <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#111">${de.subject}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#555">${de.lead}</p>
        ${quote}
        ${button(de.cta)}
      </td></tr>
      <tr><td style="padding:8px 28px"><hr style="border:none;border-top:1px solid #eee;margin:16px 0"/></td></tr>
      <tr><td style="padding:0 28px 24px">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#999">English</p>
        <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#111">${en.subject}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#555">${en.lead}</p>
        ${quote}
        ${button(en.cta)}
      </td></tr>
      <tr><td style="padding:16px 28px;background:#fafafa;border-top:1px solid #eee">
        <p style="margin:0;font-size:12px;color:#999">Diese E-Mail wurde automatisch gesendet. · This email was sent automatically. — TyloTech</p>
      </td></tr>
    </table>
  </td></tr></table>
  </body></html>`;

  await send(to, subject, html);
}

/** Bilingual (DE + EN) password-reset email with a secure, time-limited link. */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!emailConfigured) return;
  const url = resetUrl; // already an absolute Supabase recovery action link

  const de = {
    subject: "Passwort zurücksetzen",
    lead: "Wir haben eine Anfrage erhalten, das Passwort für Ihr TyloTech-Konto zurückzusetzen. Klicken Sie auf den Button, um ein neues Passwort festzulegen.",
    cta: "Passwort zurücksetzen",
    note: "Der Link ist aus Sicherheitsgründen nur begrenzt gültig. Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren – Ihr Passwort bleibt unverändert.",
  };
  const en = {
    subject: "Reset your password",
    lead: "We received a request to reset the password for your TyloTech account. Click the button below to set a new password.",
    cta: "Reset password",
    note: "For your security this link is valid for a limited time only. If you didn't request this, you can safely ignore this email — your password stays unchanged.",
  };

  const subject = `${de.subject} · ${en.subject}`;
  const button = (label: string) =>
    `<a href="${url}" style="display:inline-block;background:#C9A84C;color:#111;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:10px;font-size:14px">${label} →</a>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5">
      <tr><td style="padding:20px 28px;border-bottom:1px solid #eee">
        <span style="font-size:17px;font-weight:700;color:#111">Tylo<span style="color:#C9A84C">Tech</span></span>
      </td></tr>
      <tr><td style="padding:24px 28px 8px">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#999">Deutsch</p>
        <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#111">${de.subject}</p>
        <p style="margin:0 0 14px;font-size:14px;color:#555;line-height:1.5">${de.lead}</p>
        ${button(de.cta)}
        <p style="margin:14px 0 0;font-size:12px;color:#999;line-height:1.5">${de.note}</p>
      </td></tr>
      <tr><td style="padding:8px 28px"><hr style="border:none;border-top:1px solid #eee;margin:16px 0"/></td></tr>
      <tr><td style="padding:0 28px 24px">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#999">English</p>
        <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#111">${en.subject}</p>
        <p style="margin:0 0 14px;font-size:14px;color:#555;line-height:1.5">${en.lead}</p>
        ${button(en.cta)}
        <p style="margin:14px 0 0;font-size:12px;color:#999;line-height:1.5">${en.note}</p>
      </td></tr>
      <tr><td style="padding:16px 28px;background:#fafafa;border-top:1px solid #eee">
        <p style="margin:0;font-size:12px;color:#999">Diese E-Mail wurde automatisch gesendet. · This email was sent automatically. — TyloTech</p>
      </td></tr>
    </table>
  </td></tr></table>
  </body></html>`;

  await send(to, subject, html);
}

/** Bilingual invitation to join the Hub; the link lets the invitee set a password. */
export async function sendInviteEmail(to: string, inviteUrl: string, inviterName: string, workspace: string): Promise<boolean> {
  if (!emailConfigured) return false;
  const inviter = esc(inviterName);
  const ws = esc(workspace);
  const de = {
    subject: `${inviterName} lädt Sie zu TyloTech ein`,
    lead: `${inviter} hat Sie zum Head Quarter von <strong>${ws}</strong> eingeladen. Legen Sie Ihr Passwort fest, um loszulegen.`,
    cta: "Einladung annehmen",
  };
  const en = {
    subject: `${inviterName} invited you to TyloTech`,
    lead: `${inviter} invited you to the <strong>${ws}</strong> Head Quarter. Set your password to get started.`,
    cta: "Accept invitation",
  };
  const button = (label: string) =>
    `<a href="${inviteUrl}" style="display:inline-block;background:#C9A84C;color:#111;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:10px;font-size:14px">${label} →</a>`;
  const block = (lang: string, c: typeof de) => `
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#999">${lang}</p>
        <p style="margin:0 0 14px;font-size:14px;color:#555;line-height:1.5">${c.lead}</p>
        ${button(c.cta)}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5">
      <tr><td style="padding:20px 28px;border-bottom:1px solid #eee">
        <span style="font-size:17px;font-weight:700;color:#111">Tylo<span style="color:#C9A84C">Tech</span></span>
      </td></tr>
      <tr><td style="padding:24px 28px 8px">${block("Deutsch", de)}</td></tr>
      <tr><td style="padding:8px 28px"><hr style="border:none;border-top:1px solid #eee;margin:16px 0"/></td></tr>
      <tr><td style="padding:0 28px 24px">${block("English", en)}</td></tr>
      <tr><td style="padding:16px 28px;background:#fafafa;border-top:1px solid #eee">
        <p style="margin:0;font-size:12px;color:#999">Diese E-Mail wurde automatisch gesendet. · This email was sent automatically. — TyloTech</p>
      </td></tr>
    </table>
  </td></tr></table>
  </body></html>`;
  await send(to, `${de.subject} · ${en.subject}`, html);
  return true;
}


/** Bilingual monthly report email with the PDF attached. Returns true if Resend accepted it. */
export async function sendMonthlyReportEmail(
  to: string,
  opts: { company: string; periodLabel: string; pdf: Buffer; filename: string; portalPath: string },
): Promise<boolean> {
  if (!emailConfigured) return false;
  const company = esc(opts.company);
  const month = esc(opts.periodLabel);
  const url = `${APP_URL}${opts.portalPath}`;
  const button = (label: string) =>
    `<a href="${url}" style="display:inline-block;background:#C9A84C;color:#111;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:10px;font-size:14px">${label} →</a>`;
  const block = (lang: string, lead: string, cta: string) => `
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#999">${lang}</p>
        <p style="margin:0 0 14px;font-size:14px;color:#555;line-height:1.5">${lead}</p>
        ${button(cta)}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5">
      <tr><td style="padding:20px 28px;border-bottom:1px solid #eee">
        <span style="font-size:17px;font-weight:700;color:#111">Tylo<span style="color:#C9A84C">Tech</span></span>
      </td></tr>
      <tr><td style="padding:24px 28px 8px">${block(
        "Deutsch",
        `Ihr Monatsbericht für <strong>${company}</strong> (${month}) ist da. Sie finden ihn als PDF im Anhang und jederzeit in Ihrem Portal unter Dokumente.`,
        "Im Portal ansehen",
      )}</td></tr>
      <tr><td style="padding:8px 28px"><hr style="border:none;border-top:1px solid #eee;margin:16px 0"/></td></tr>
      <tr><td style="padding:0 28px 24px">${block(
        "English",
        `Your monthly report for <strong>${company}</strong> (${month}) is ready. The PDF is attached and always available in your portal under Documents.`,
        "Open portal",
      )}</td></tr>
      <tr><td style="padding:16px 28px;background:#fafafa;border-top:1px solid #eee">
        <p style="margin:0;font-size:12px;color:#999">Diese E-Mail wurde automatisch gesendet. · This email was sent automatically. — TyloTech</p>
      </td></tr>
    </table>
  </td></tr></table>
  </body></html>`;
  return send(to, `Monatsbericht ${opts.periodLabel} · ${opts.company}`, html, [
    { filename: opts.filename, content: opts.pdf.toString("base64") },
  ]);
}

/** "Du bist dran" — a workflow step became active and is assigned to this team member. */
export async function sendStepAssignedEmail(
  to: string,
  e: { step: string; process: string; partner: string; due: string | null; path: string; instructions?: string | null },
): Promise<boolean> {
  if (!emailConfigured) return false;
  const link = `${APP_URL}${e.path}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5">
      <tr><td style="padding:20px 28px;border-bottom:1px solid #eee">
        <span style="font-size:17px;font-weight:700;color:#111">Tylo<span style="color:#C9A84C">Tech</span></span>
      </td></tr>
      <tr><td style="padding:24px 28px">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#999">${esc(e.process)} · ${esc(e.partner)}</p>
        <p style="margin:0 0 10px;font-size:18px;font-weight:700;color:#111">Du bist dran: ${esc(e.step)}</p>
        ${e.instructions ? `<p style="margin:0 0 12px;font-size:14px;color:#555;line-height:1.5">${esc(e.instructions)}</p>` : ""}
        ${e.due ? `<p style="margin:0 0 16px;font-size:14px;color:#555">Fällig: <strong>${esc(e.due)}</strong></p>` : ""}
        <a href="${link}" style="display:inline-block;background:#C9A84C;color:#111;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:10px;font-size:14px">Schritt öffnen →</a>
      </td></tr>
      <tr><td style="padding:16px 28px;background:#fafafa;border-top:1px solid #eee">
        <p style="margin:0;font-size:12px;color:#999">Automatische Benachrichtigung aus TyloHQ · Prozesse</p>
      </td></tr>
    </table>
  </td></tr></table>
  </body></html>`;
  return send(to, `Du bist dran: ${e.step} bei ${e.partner}`, html);
}
