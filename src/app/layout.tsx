import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Tonight — stop scrolling, start watching",
  description:
    "Two people, one deck of 30 titles, one thing you both actually want to watch — and where to stream it in India right now.",
};

export const viewport: Viewport = {
  themeColor: "#08080B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans min-h-full">{children}</body>
    </html>
  );
}
