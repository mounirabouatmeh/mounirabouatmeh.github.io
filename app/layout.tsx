import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cuberence | Travel Decision Intelligence",
  description: "AI-assisted travel decision intelligence for professional travel advisors.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
