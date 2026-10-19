"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // The app has one light theme; it doesn't follow the system's dark mode.
    <ThemeProvider attribute="class" forcedTheme="light" disableTransitionOnChange>
      {children}
      <Toaster richColors theme="light" position="top-center" />
    </ThemeProvider>
  );
}
