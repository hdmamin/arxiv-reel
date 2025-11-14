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
  title: "GrugTok - Research Papers, Grug Style",
  description: "TikTok-style interface for browsing ML research papers with simple Grug explanations. Swipe through the latest arXiv papers.",
  keywords: ["GrugTok", "arXiv", "research papers", "ML", "AI", "TikTok", "Grug", "machine learning"],
  authors: [{ name: "GrugTok Team" }],
  openGraph: {
    title: "GrugTok",
    description: "Research papers, Grug style",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GrugTok",
    description: "Research papers, Grug style",
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
