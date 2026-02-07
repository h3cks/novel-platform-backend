import nodemailer from 'nodemailer';
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, NODE_ENV } from '../config';

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

async function createTransporter(): Promise<nodemailer.Transporter> {

  if (NODE_ENV === 'production' && SMTP_HOST) {

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
    try {
      await transporter.verify();

    } catch (err) {

      throw err;
    }
    return transporter;
  }


  const testAccount = await nodemailer.createTestAccount();

  const transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
  try {
    await transporter.verify();

  } catch (err) {

  }
  return transporter;
}

export async function sendMail(to: string, subject: string, html: string) {

  if (!EMAIL_FROM) {
    throw new Error('EMAIL_FROM is not configured');
  }
  const transporter = await getTransporter();
  try {
    const info = await transporter.sendMail({ from: EMAIL_FROM, to, subject, html });
    const preview = nodemailer.getTestMessageUrl(info);
    console.log('sendMail: messageId=', info.messageId, 'previewUrl=', preview);
    return { info, previewUrl: preview ?? null };
  } catch (err) {
    throw err;
  }
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = createTransporter();
  }
  return transporterPromise;
}


export async function sendConfirmationEmail(to: string, token: string) {
  const confirmUrl = `${
    process.env.API_URL ?? 'http://localhost:4000'
  }/auth/confirm?token=${encodeURIComponent(token)}`;
  const html = `
    <p>Доброго дня!</p>
    <p>Натисніть посилання, щоб підтвердити ваш email:</p>
    <p><a href="${confirmUrl}">${confirmUrl}</a></p>
    <p>Якщо ви не реєструвалися — проігноруйте цей лист.</p>
  `;

  return sendMail(to, 'Підтвердження email — Novel Platform', html);
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const resetUrl = `${frontend}/reset-password?token=${encodeURIComponent(token)}`;
  const html = `
    <p>Ви запросили скидання пароля.</p>
    <p>Перейдіть за посиланням, щоб задати новий пароль (лінк дійсний обмежений час):</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>Якщо ви не запитували скидання — проігноруйте цей лист.</p>
  `;
  return sendMail(to, 'Скидання пароля — Novel Platform', html);
}
