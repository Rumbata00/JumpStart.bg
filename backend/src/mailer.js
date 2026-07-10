require('dotenv').config();

// Sent via EmailJS REST API (HTTPS) instead of SMTP — Render and most PaaS
// hosts block outbound SMTP ports, but HTTPS always works. EmailJS proxies
// through a real connected Gmail account, so delivery behaves like normal
// Gmail SMTP (same practical limits), just reachable from anywhere.
// Docs: https://www.emailjs.com/docs/rest-api/send/
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const hasCredentials = !!(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY && EMAILJS_PRIVATE_KEY);

const FROM_EMAIL = process.env.EMAIL_USER || 'jumpstart.bg.official@gmail.com';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function sendCodeEmail({ to, subject, heading, intro, code }) {
  if (!hasCredentials) {
    console.log(`[mailer] EmailJS credentials not set — email to ${to} (${subject}), code: ${code}`);
    return;
  }

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      // The template's "To Email" field is set to {{email}} — this param
      // name must match that exactly or EmailJS silently misdelivers.
      template_params: { email: to, subject, heading, intro, code },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`EmailJS send failed (${res.status}): ${body}`);
  }
}

async function sendPasswordResetEmail(to, code) {
  await sendCodeEmail({
    to,
    subject: 'Смяна на парола — JumpStart',
    heading: 'Смяна на парола',
    intro: 'Използвайте кода по-долу, за да зададете нова парола за профила си в JumpStart:',
    code,
  });
}

async function sendContactMessage({ name, email, message }) {
  await sendCodeEmail({
    to: FROM_EMAIL,
    subject: `Ново съобщение от ${name} — JumpStart`,
    heading: 'Ново съобщение от контактната форма',
    intro: `От: ${escapeHtml(name)} (${escapeHtml(email)})`,
    code: escapeHtml(message).slice(0, 500),
  });
}

module.exports = { sendPasswordResetEmail, sendContactMessage };
