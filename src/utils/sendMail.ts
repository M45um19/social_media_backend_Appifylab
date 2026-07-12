import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export interface SendMailOptions {
  email: string;
  subject: string;
  message: string;
  html?: string;
}

const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: env.EMAIL_PORT,
  secure: env.EMAIL_PORT === 465,
  auth: env.EMAIL_USER && env.EMAIL_PASS ? {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  } : undefined,
});

/**
 * Sends an email using Nodemailer and the global email configuration.
 *
 * @param options Mail details including recipient, subject, text body, and optional HTML body.
 */
export const sendMail = async (options: SendMailOptions): Promise<void> => {
  const mailOptions = {
    from: `"Social Media App" <${env.EMAIL_USER}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  await transporter.sendMail(mailOptions);
};
