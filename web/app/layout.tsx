import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { ActiveWalletProvider } from "@/components/ActiveWalletContext";

export const metadata: Metadata = {
  title: "Solana Bonds",
  description: "Dual-token debt-bond platform on Solana (EuroCC + BonoDeuda).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <ActiveWalletProvider>
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </ActiveWalletProvider>
      </body>
    </html>
  );
}
