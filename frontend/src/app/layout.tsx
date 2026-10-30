import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgroPulse AI — Copiloto Agêntico de Inteligência Comercial e Estoque",
  description:
    "Plataforma executiva de inteligência comercial, correlação agroclimática (Z-score), afinidade de consultores e remanejamento preditivo de estoque para distribuidoras de insumos agropecuários.",
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
      <body className="min-h-screen bg-[#0a1611] font-sans text-[#f0fdf4] selection:bg-[#22c55e]/30 selection:text-[#f0fdf4]">
        {children}
      </body>
    </html>
  );
}
