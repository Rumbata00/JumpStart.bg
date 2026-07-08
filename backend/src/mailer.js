const nodemailer = require('nodemailer');
require('dotenv').config();

// Without real credentials we still want registration / password reset to
// work end-to-end in dev — so we fall back to logging the email to the
// console instead of failing. EMAIL_USER is a Gmail address; GMAIL_APP_PASSWORD
// is an App Password (myaccount.google.com/apppasswords), not the normal
// account password — requires 2-Step Verification enabled on the account.
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.GMAIL_APP_PASSWORD;
const hasCredentials = !!(EMAIL_USER && EMAIL_PASS);

// Explicit host/port 587 (STARTTLS) instead of the "gmail" shorthand
// (which defaults to port 465) — some hosts block 465 but allow 587.
const transporter = hasCredentials
  ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      connectionTimeout: 15000,
    })
  : null;

async function sendEmail({ to, subject, html }) {
  if (!transporter) {
    console.log(`[mailer] EMAIL_USER/GMAIL_APP_PASSWORD not set — email to ${to} (${subject}):\n${html}`);
    return;
  }

  await transporter.sendMail({
    from: `"JumpStart" <${EMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function codeEmailHtml({ heading, intro, code }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="color:#16233F;margin-bottom:8px;">${heading}</h2>
      <p style="color:#5B5A52;font-size:14px;">${intro}</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#E8622C;text-align:center;padding:18px 0;">${code}</div>
      <p style="color:#8C8A7E;font-size:12.5px;">Кодът е валиден 15 минути. Ако не сте заявявали това, просто игнорирайте този имейл.</p>
    </div>`;
}

async function sendVerificationEmail(to, code) {
  await sendEmail({
    to,
    subject: 'Потвърдете имейл адреса си — JumpStart',
    html: codeEmailHtml({
      heading: 'Потвърдете имейл адреса си',
      intro: 'Използвайте кода по-долу, за да завършите регистрацията си в JumpStart:',
      code,
    }),
  });
}

async function sendPasswordResetEmail(to, code) {
  await sendEmail({
    to,
    subject: 'Смяна на парола — JumpStart',
    html: codeEmailHtml({
      heading: 'Смяна на парола',
      intro: 'Използвайте кода по-долу, за да зададете нова парола за профила си в JumpStart:',
      code,
    }),
  });
}

async function sendContactMessage({ name, email, message }) {
  await sendEmail({
    to: EMAIL_USER,
    subject: `Ново съобщение от ${name} — JumpStart`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#16233F;margin-bottom:14px;">Ново съобщение от контактната форма</h2>
        <p style="color:#5B5A52;font-size:14px;"><strong>Име:</strong> ${escapeHtml(name)}</p>
        <p style="color:#5B5A52;font-size:14px;"><strong>Имейл:</strong> ${escapeHtml(email)}</p>
        <p style="color:#5B5A52;font-size:14px;"><strong>Съобщение:</strong></p>
        <p style="color:#1C1B17;font-size:14px;white-space:pre-wrap;background:#F7F5F0;padding:14px;border-radius:8px;">${escapeHtml(message)}</p>
      </div>`,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendContactMessage };
