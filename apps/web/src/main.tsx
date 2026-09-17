import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/App";
import { CrashCard } from "@/components/CrashCard";
import { RenderErrorBoundary } from "@/components/RenderErrorBoundary";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <RenderErrorBoundary
        fallback={({ error }) => <CrashCard error={error} variant="page" />}
      >
        <App />
      </RenderErrorBoundary>
    </ThemeProvider>
  </StrictMode>
);
