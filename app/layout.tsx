import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InstantGPA — GPA Calculator & Academic Planner",
  description:
    "Calculate GPA, import transcript data, plan semesters, and review degree progress with transparent grade calculations.",
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
