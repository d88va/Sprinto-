import nodemailer from "nodemailer";
import type { Contact, Email } from "./types";

/** Step 7. Recipient is ALWAYS SEND_TO (your own address), never the prospect. */
export async function sendEmail(email: Email, contact: Contact, company: string): Promise<string> {
  const to = process.env.SEND_TO;
  if (!to) throw new Error("SEND_TO is not set");
  const banner = `[TEST SEND - would go to ${contact.first_name} ${contact.last_name}, ${contact.position} at ${company} <${contact.value}>]\n\n`;
  if (process.env.DRY_RUN === "1" || !(process.env.GMAIL_ADDRESS && process.env.GMAIL_APP_PASSWORD)) return `dry-run: not sent (would deliver to ${to})`;
  const user = process.env.GMAIL_ADDRESS;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("GMAIL_ADDRESS / GMAIL_APP_PASSWORD not set");
  const tx = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  await tx.sendMail({ from: user, to, subject: email.subject, text: banner + email.body });
  return `sent to ${to}`;
}
