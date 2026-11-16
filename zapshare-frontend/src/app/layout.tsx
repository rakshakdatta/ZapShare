import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZapShare",
  description: "Share files with nearby devices over Wi-Fi or a hotspot.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
