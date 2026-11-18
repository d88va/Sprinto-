import type { Metadata } from "next";
import Link from "next/link";
import { Newsreader, Inter } from "next/font/google";
import "./globals.css";
import { Store } from "@/components/Store";
import { Header } from "@/components/Header";

const serif = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Sprinto Outreach",
  description: "Research, qualify and draft personalised cold emails at scale. A human approves every send.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body>
        <Store>
          <div className="wrap">
            <Header />
            <main>{children}</main>
            <footer className="foot">
              <div>
                The AI reads and writes; code decides. Every fact in an email is checked against the prospect&apos;s own website before you
                see it, and nothing is sent without your approval.
              </div>
              <div style={{ marginTop: 8 }}>
                <Link href="/about">How it works</Link> &nbsp;·&nbsp; <Link href="/icp">Edit who we target</Link>
              </div>
            </footer>
          </div>
        </Store>
      </body>
    </html>
  );
}
