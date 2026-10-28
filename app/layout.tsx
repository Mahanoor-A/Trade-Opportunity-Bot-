import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Rationale Studio | Foundry FX",
  description: "Advisor drafting workspace for FX trade rationale.",
  icons: { icon: "/foundry-mark.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
