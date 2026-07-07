import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { WorkspaceProvider } from "@/lib/mock-context";
import { ThemeProvider } from "@/lib/theme-context";
import { I18nProvider } from "@/lib/i18n-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI PDF Workspace",
  description: "A multi-workspace text PDF knowledge workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground transition-colors duration-200">
        <I18nProvider>
          <ThemeProvider>
            <WorkspaceProvider>{children}</WorkspaceProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
