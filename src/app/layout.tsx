import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TLDRxiv",
  description: "Scroll through today's ML research in bite-sized cards. Key question, core idea, and the bet behind each paper.",
  keywords: ["TLDRxiv", "arXiv", "research papers", "ML", "AI", "machine learning", "tl;dr"],
  authors: [{ name: "TLDRxiv" }],
  openGraph: {
    title: "TLDRxiv",
    description: "Today's ML research, one idea at a time",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TLDRxiv",
    description: "Today's ML research, one idea at a time",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
