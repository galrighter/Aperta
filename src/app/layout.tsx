import type { Metadata, Viewport } from "next";
import { Archivo, Assistant } from "next/font/google";
import { he } from "@/i18n/he";
import { SITE } from "@/lib/site.config";
import "./globals.css";

// מתארחים עצמית דרך next/font במקום <link> ל-fonts.googleapis.com: חוסך שתי
// בקשות preconnect + גיליון חוסם-רינדור לדומיין שלישי, ומעלים את הכשל שבו
// חוסמי מעקב חוסמים את הפונט ומפילים את הטיפוגרפיה ל-system-ui.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-assistant",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: he.appTitle,
  description: he.site.heroSubtitleSeo,
  applicationName: he.site.brand,
  // opengraph-image.png / apple-icon.png / icon.svg נאספים אוטומטית מ-src/app
  // על ידי מוסכמת הקבצים של Next, כולל התגים og:image ו-twitter:image.
  openGraph: {
    type: "website",
    locale: "he_IL",
    siteName: he.site.brand,
    title: `${he.site.brand} — ${he.site.tagline}`,
    description: he.site.heroSubtitleSeo,
    url: SITE.url,
  },
  twitter: {
    card: "summary_large_image",
    title: `${he.site.brand} — ${he.site.tagline}`,
    description: he.site.heroSubtitleSeo,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // בלי maximumScale/userScalable: חסימת פינץ'-זום מפרה WCAG 1.4.4 ופוגעת
  // דווקא במי שצריך להגדיל כדי לקרוא.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${archivo.variable} ${assistant.variable}`}>
      <body className="bg-porcelain text-graphite antialiased">{children}</body>
    </html>
  );
}
