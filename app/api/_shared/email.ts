type EmailResult = {
  sent: boolean;
  configured: boolean;
  id?: string;
  error?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

export async function sendPremiumWelcomeEmail(email: string, displayName = ""): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const replyTo = process.env.RESEND_REPLY_TO?.trim();
  if (!apiKey || !from) return { sent: false, configured: false };

  const safeName = escapeHtml(displayName.trim() || "there");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: "Your InstantGPA Premium subscription is active",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#14213d"><h1>Welcome to InstantGPA Premium</h1><p>Hello ${safeName},</p><p>Your paid subscription is active. You can now import transcripts up to 30 pages and use every Premium academic-planning tool for students.</p><p><a href="https://instantgpa.com/pro-workspace">Open your Premium workspace</a></p><p>— InstantGPA</p></div>`,
      text: `Hello ${displayName.trim() || "there"},\n\nYour paid InstantGPA Premium subscription is active. You can now import transcripts up to 30 pages and use every Premium academic-planning tool for students.\n\nhttps://instantgpa.com/pro-workspace`,
    }),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
  return response.ok
    ? { sent: true, configured: true, id: body.id }
    : { sent: false, configured: true, error: body.message || "Resend rejected the email." };
}

export async function sendSubscriptionLifecycleEmail(
  email: string,
  event: "cancelled" | "suspended" | "expired" | "payment_failed",
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const replyTo = process.env.RESEND_REPLY_TO?.trim();
  if (!apiKey || !from) return { sent: false, configured: false };
  const copy = {
    cancelled: { subject: "Your InstantGPA Premium subscription was cancelled", body: "PayPal confirmed cancellation of your InstantGPA Premium subscription. Your Premium access is no longer active." },
    suspended: { subject: "Your InstantGPA Premium subscription is suspended", body: "PayPal reported that your subscription is suspended. Review the payment method in PayPal to restore Premium access." },
    expired: { subject: "Your InstantGPA Premium subscription expired", body: "Your InstantGPA Premium subscription has expired. You can start a new subscription from the pricing page." },
    payment_failed: { subject: "PayPal could not collect your InstantGPA payment", body: "PayPal reported a failed subscription payment. Update the payment method in PayPal to avoid interruption." },
  }[event];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: copy.subject,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#14213d"><h1>InstantGPA Premium</h1><p>${escapeHtml(copy.body)}</p><p><a href="https://instantgpa.com/account">Open account</a></p></div>`,
      text: `${copy.body}\n\nhttps://instantgpa.com/account`,
    }),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
  return response.ok
    ? { sent: true, configured: true, id: body.id }
    : { sent: false, configured: true, error: body.message || "Resend rejected the email." };
}
