import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { LogoDots } from "@/components/logo-dots";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2.5">
          <LogoDots
            accent="var(--brand)"
            aria-hidden
            className="h-5 w-5"
            style={{ color: "var(--foreground)" }}
          />
          <span className="font-sans font-semibold text-base text-foreground tracking-[-0.01em]">
            SFab
          </span>
          <span className="font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.2em]">
            Bench
          </span>
        </span>
      ),
    },
    links: [
      {
        text: "Home",
        url: "/",
      },
    ],
  };
}
