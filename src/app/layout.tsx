import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lightweight Agent",
  description: "Shareable AI assistant starter",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0a", color: "#e5e5e5" }}>
        {children}
      </body>
    </html>
  );
}
