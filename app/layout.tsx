import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./videoke.css";

const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-karaokz-sans",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-karaokz-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KaraOkz — Home Videoke",
  description: "Your living room, your stage. Offline local karaoke videos, a traditional songbook, and singer reservations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
