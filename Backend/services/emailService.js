// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Email service (SMTP over environment variables only).
//
// Security contract:
//   * SMTP credentials are read EXCLUSIVELY from process.env (SMTP_HOST/PORT/USER/
//     PASSWORD/FROM, with legacy EMAIL_* fallback for this repo's existing .env).
//   * They are never sent to the browser and never appear in API responses.
//   * SMTP_ENABLED is the hard switch. Until real credentials are configured the
//     service runs in "log-only" mode: it builds and logs the exact email that
//     WOULD be sent — so the whole workflow can be developed/tested offline, and
//     no real email can ever leak to a real inbox by accident.
//   * Sending is best-effort and non-fatal: a failure is logged server-side, it
//     never fails the primary operation (account creation etc.).
// ─────────────────────────────────────────────────────────────────────────────
const nodemailer = require('nodemailer');

const buildConfig = () => {
  const smtp = {
    host: process.env.SMTP_HOST || process.env.EMAIL_HOST || '',
    port: Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    user: process.env.SMTP_USER || process.env.EMAIL_USER || '',
    pass: process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD || '',
    from: process.env.SMTP_FROM || `CT University OBE ERP <${process.env.EMAIL_USER || 'noreply@local.in'}>`,
    enabled: String(process.env.SMTP_ENABLED || '').toLowerCase() === 'true',
  };
  return smtp;
};

let transporterCache = null;
const getTransporter = () => {
  const conf = buildConfig();
  if (!transporterCache && conf.host) {
    transporterCache = nodemailer.createTransport({
      host: conf.host,
      port: conf.port,
      secure: conf.secure,
      auth: conf.user ? { user: conf.user, pass: conf.pass } : undefined,
    });
  }
  return transporterCache;
};

const smtpEnabled = () => buildConfig().enabled;

/**
 * sendMail — sends (or, in log-only mode, logs) an email.
 * @param {{ to: string, subject: string, html: string, text?: string }} msg
 * @returns {Promise<{ sent: boolean, simulated?: boolean, messageId?: string }>}
 */
const sendMail = async ({ to, subject, html }) => {
  if (!smtpEnabled()) {
    console.info('[emailService:disabled] WOULD SEND EMAIL (set SMTP_ENABLED=true to enable)\n' +
      `  to:      ${to}\n  subject: ${subject}\n  html:\n${html.slice(0, 2000)}`);
    return { sent: false, simulated: true };
  }
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[emailService] SMTP not configured — cannot send. Enable SMTP_ENABLED + credentials in env.');
    return { sent: false, simulated: true };
  }
  try {
    const info = await transporter.sendMail({
      from: buildConfig().from,
      to,
      subject,
      html,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[emailService] send failed:', err.message);
    return { sent: false, error: err.message };
  }
};

const setupUrl = (token) => {
  const base = process.env.PASSWORD_RESET_URL || 'http://localhost:5173/set-password';
  return `${base}?token=${encodeURIComponent(token)}`;
};

// Reset link for the HOD/Administrator self-service flow. Reuses PASSWORD_RESET_URL
// (never a hardcoded production host) and tags the URL with mode=reset so the shared
// /set-password page calls the reset endpoint instead of the teacher setup endpoint.
const resetUrl = (token) => {
  const base = process.env.PASSWORD_RESET_URL || 'http://localhost:5173/set-password';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(token)}&mode=reset`;
};
/**
 * buildCredentialEmail — the §3 welcome / credential email.
 * Prefers a secure password-setup link (no permanent plaintext in email). If the
 * deployment explicitly opts into username/password delivery (SEND_TEMP_PASSWORD=1),
 * the temporary password is included instead — still only a *temporary* password
 * that must be changed at first login (must_change_password=1).
 */
const buildCredentialEmail = ({ name, employeeId, username, email, setupToken, temporaryPassword }) => {
  const loginUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const sendTemp = String(process.env.SEND_TEMP_PASSWORD || '').toLowerCase() === '1'
    || String(process.env.SEND_TEMP_PASSWORD || '').toLowerCase() === 'true';

  const credLines = sendTemp && temporaryPassword
    ? `<tr><td style="padding:6px 0"><b>Temporary Password</b></td><td style="padding:6px 0"><code style="background:#f1f5f9;padding:2px 8px;border-radius:4px">${temporaryPassword}</code></td></tr>`
    : `<tr><td style="padding:6px 0"><b>Set Password</b></td><td style="padding:6px 0"><a href="${setupUrl(setupToken)}" style="color:#2563eb">Create your password</a> (valid for ${process.env.PASSWORD_RESET_EXPIRY_HOURS || 24} hours)</td></tr>`;

  const html = `<!doctype html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:#1e3a8a;padding:16px 24px">
      <h2 style="color:#fff;margin:0;font-size:18px">CT University OBE ERP</h2>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 12px">Hello <b>${name}</b>,</p>
      <p style="margin:0 0 16px">Your faculty account has been created successfully. You can now log in to the Outcome-Based Education (OBE) ERP portal.</p>
      <table style="font-size:14px;margin:0 0 16px">
        ${name ? `<tr><td style="padding:6px 0;color:#64748b;width:160px">Name</td><td style="padding:6px 0"><b>${name}</b></td></tr>` : ''}
        ${employeeId ? `<tr><td style="padding:6px 0;color:#64748b">Employee ID</td><td style="padding:6px 0"><b>${employeeId}</b></td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#64748b">Username</td><td style="padding:6px 0"><b>${username || email}</b></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0">${email}</td></tr>
        ${credLines}
      </table>
      <p style="margin:0 0 8px"><b>Login URL:</b> <a href="${loginUrl}" style="color:#2563eb">${loginUrl}</a></p>
      <div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;font-size:13px;color:#334155;margin-top:16px">
        <b>Next steps:</b>
        <ol style="margin:6px 0 0;padding-left:20px">
          <li>Log in with your email/username and password.</li>
          ${sendTemp && temporaryPassword ? '<li>You will be asked to change the temporary password on first login.</li>' : '<li>Click the password-setup link above and choose your own secure password.</li>'}
          <li>Select your assigned subject/class and create assessments.</li>
        </ol>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">If you did not expect this email, please ignore it or contact your administrator.</p>
    </div>
  </div>
</body></html>`;

  return { subject: 'CT University OBE ERP — Account Created Successfully', html };
};

/**
 * buildPasswordResetEmail — the HOD / Administrator self-service password-reset email.
 * Contains ONLY: the reset link, its expiry window, and a security notice. It never
 * includes the current password, any password hash, DB credentials, or SMTP credentials.
 */
const buildPasswordResetEmail = ({ name, email, resetToken, expiresHours }) => {
  const hours = expiresHours || Number(process.env.PASSWORD_RESET_EXPIRY_HOURS || 24);
  const link = resetUrl(resetToken);
  const html = `<!doctype html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:#1e3a8a;padding:16px 24px">
      <h2 style="color:#fff;margin:0;font-size:18px">CT University OBE ERP</h2>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 12px">Hello <b>${name || email}</b>,</p>
      <p style="margin:0 0 16px">A password reset was requested for your <b>${name ? name + ' (' + email + ')' : email}</b> account.</p>
      <p style="margin:0 0 20px">Use the button below to choose a new password. This link is valid for <b>${hours} hours</b> and can be used only once.</p>
      <p style="margin:0 0 24px;text-align:center">
        <a href="${link}" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600">Reset Password</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#64748b">Or copy this link into your browser:</p>
      <p style="margin:0 0 20px;font-size:12px;word-break:break-all"><a href="${link}" style="color:#2563eb">${link}</a></p>
      <div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;font-size:13px;color:#334155">
        <b>Security notice:</b> If you did not request this password reset, you can safely ignore this email — your password will not change. For your protection, this link expires after ${hours} hours or as soon as it is used.
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">CT University OBE ERP — this is an automated message, please do not reply.</p>
    </div>
  </div>
</body></html>`;

  return { subject: 'Reset Your CT University OBE ERP Password', html };
};

/**
 * buildCourseAssignmentEmail — notification email sent when a user is assigned to a course.
 */
const buildCourseAssignmentEmail = ({ name, email, courseCode, courseName, role, assignedByName, courseUrl }) => {
  const loginUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const targetUrl = courseUrl || `${loginUrl}`;
  const html = `<!doctype html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:#1e3a8a;padding:16px 24px">
      <h2 style="color:#fff;margin:0;font-size:18px">CT University OBE ERP</h2>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 12px">Hello <b>${name || email}</b>,</p>
      <p style="margin:0 0 16px">You have been assigned to the following course in the Outcome-Based Education (OBE) ERP system:</p>
      <table style="font-size:14px;margin:0 0 16px;width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#64748b;width:140px">Course Code</td><td style="padding:6px 0"><b>${courseCode || 'N/A'}</b></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Course Name</td><td style="padding:6px 0"><b>${courseName || 'N/A'}</b></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Assigned Role</td><td style="padding:6px 0"><span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-weight:600">${role || 'Teacher'}</span></td></tr>
        ${assignedByName ? `<tr><td style="padding:6px 0;color:#64748b">Assigned By</td><td style="padding:6px 0">${assignedByName}</td></tr>` : ''}
      </table>
      <p style="margin:20px 0;text-align:center">
        <a href="${targetUrl}" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600">Open Course Workspace</a>
      </p>
      <div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;font-size:13px;color:#334155;margin-top:16px">
        <b>What you can do next:</b>
        <ol style="margin:6px 0 0;padding-left:20px">
          <li>Review Course Outcomes (COs) and question mappings.</li>
          <li>Enter student assessment marks (Question-wise or CO-wise).</li>
          <li>Track CO-PO attainment levels and progress reports.</li>
        </ol>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">CT University OBE ERP — this is an automated message, please do not reply.</p>
    </div>
  </div>
</body></html>`;

  return {
    subject: `Assigned to Course: ${courseCode ? courseCode + ' - ' : ''}${courseName || 'Course'}`,
    html,
  };
};

module.exports = { sendMail, buildCredentialEmail, buildPasswordResetEmail, buildCourseAssignmentEmail, setupUrl, resetUrl, buildConfig, smtpEnabled };