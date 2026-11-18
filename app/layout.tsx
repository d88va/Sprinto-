import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Sprinto Outreach", description: "Cold outreach at scale, with a human gate" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
