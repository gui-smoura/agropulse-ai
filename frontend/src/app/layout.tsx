import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgroPulse AI — Operações e Estoque de Insumos",
  description:
    "Painel de controle comercial, correlação agroclimática, afinidade de consultores e remanejamento de estoque para distribuidoras de insumos agropecuários.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html
      lang="pt-BR"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-[#111413] font-sans text-[#eef2ef] selection:bg-[#22c55e]/25 selection:text-[#eef2ef]">
        {children}
      </body>
    </html>
  );
}
