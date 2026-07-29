import "./globals.css";
import { AuthProvider } from "@/lib/AuthProvider";
import RegisterSW from "./RegisterSW";

export const metadata = {
  title: "Rotina — Gestão de Saúde",
  description: "Academia, água, dieta e casa em um só lugar.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rotina",
  },
};

export const viewport = {
  themeColor: "#14181C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>
          <RegisterSW />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
