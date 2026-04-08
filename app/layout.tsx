import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PropTech CRM — Uzbekistan",
  description: "AI-powered real estate CRM platform for Uzbekistan",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ backgroundColor: "#080b14", color: "#e2e8f0", fontFamily: "var(--font-body)" }}>
        {children}
      </body>
    </html>
  );
}
