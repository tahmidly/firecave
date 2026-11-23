import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Firecave" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Theme class is applied before paint to avoid a flash; defaults to dark.
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement,t=localStorage.getItem("localclaw.theme");if(t==="light")d.classList.remove("dark")}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
