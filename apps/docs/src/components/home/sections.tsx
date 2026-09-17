import { useEffect, useState } from "react";
import { DesktopMock } from "@/components/home/desktop-mock";
import { HairlineGrid } from "@/components/home/hairline-grid";
import { LogoDots } from "@/components/logo-dots";
import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { Mono } from "@/components/ui/mono";
import { Rule } from "@/components/ui/rule";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const GITHUB = "https://github.com/sfab-oss/sfab-bench";
const RELEASES = `${GITHUB}/releases`;
const SFAB = "https://sfab.ai";

/** Vendored from svgl.app. Do not hotlink the API. */
const PROVIDERS = [
  {
    name: "Claude Code",
    light: "/brand/providers/claude.svg",
    dark: "/brand/providers/claude.svg",
  },
  {
    name: "Codex",
    light: "/brand/providers/openai-light.svg",
    dark: "/brand/providers/openai-dark.svg",
  },
  {
    name: "Grok",
    light: "/brand/providers/grok-light.svg",
    dark: "/brand/providers/grok-dark.svg",
  },
  {
    name: "OpenCode",
    light: "/brand/providers/opencode-light.svg",
    dark: "/brand/providers/opencode-dark.svg",
  },
] as const;

export function Hero() {
  return (
    <section className="relative mx-auto w-full max-w-5xl px-6 pt-20 pb-8 md:pt-24">
      <Display className="max-w-3xl text-4xl sm:text-5xl md:text-6xl">
        CAD on your Mac. Talk to it with the AI you already pay for.
      </Display>
      <div className="mt-7 flex flex-wrap gap-3">
        <Button asChild>
          <a href={RELEASES}>Download for macOS</a>
        </Button>
        <Button asChild variant="ghost">
          <a href="#run">How to run</a>
        </Button>
      </div>
      <div className="mt-10">
        <p className="mb-3 font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.2em]">
          Desktop
        </p>
        <DesktopMock />
      </div>
    </section>
  );
}

export function Providers() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-10" id="providers">
      <ul className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {PROVIDERS.map((row) => (
          <li className="flex items-center gap-3" key={row.name}>
            <span className="relative h-7 w-7 shrink-0">
              <img
                alt=""
                className="h-7 w-7 object-contain dark:hidden"
                height={28}
                src={row.light}
                width={28}
              />
              <img
                alt=""
                className="hidden h-7 w-7 object-contain dark:block"
                height={28}
                src={row.dark}
                width={28}
              />
            </span>
            <span className="font-medium text-sm">{row.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OpenMac() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-12" id="run">
      <h2 className="font-semibold text-lg">How to run</h2>
      <HairlineGrid className="mt-6 sm:grid-cols-2">
        <div className="bg-background p-6">
          <h3 className="font-semibold text-base">Mac</h3>
          <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
            Unzip the <code>.app</code> from Releases, drag it to Applications,
            then System Settings → Privacy &amp; Security → Open Anyway. Ad-hoc
            signed, not notarised yet. Or clone and{" "}
            <Mono asChild className="text-foreground" size="sm">
              <code>pnpm desktop</code>
            </Mono>
            .
          </p>
        </div>
        <div className="bg-background p-6">
          <h3 className="font-semibold text-base">Quest</h3>
          <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
            Quest Browser on the same Wi-Fi, pair once.
          </p>
        </div>
      </HairlineGrid>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-5xl px-6 pt-12 pb-16">
      <Rule className="mb-8" />
      <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="font-sans font-semibold text-base text-foreground tracking-[-0.01em]">
            SFab Bench
          </span>
          {[
            { label: "GitHub", href: GITHUB },
            { label: "Releases", href: RELEASES },
            { label: "SFab", href: SFAB },
          ].map((l) => (
            <Mono
              asChild
              caps
              className="tracking-[0.14em] transition-colors hover:text-foreground"
              key={l.label}
              size="md"
            >
              <a href={l.href} rel="noreferrer" target="_blank">
                {l.label}
              </a>
            </Mono>
          ))}
        </div>
        <ThemeToggle />
      </div>
    </footer>
  );
}

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed inset-x-0 top-0 z-50 transition-colors"
      style={{
        background: scrolled
          ? "color-mix(in srgb, var(--background) 82%, transparent)"
          : "transparent",
        backdropFilter: scrolled ? "blur(8px)" : "none",
        borderBottom: scrolled
          ? "1px solid var(--border)"
          : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <a className="flex items-center gap-2.5" href="#top">
          <LogoDots
            accent="var(--brand)"
            aria-hidden
            className="h-6 w-6"
            style={{ color: "var(--foreground)" }}
          />
          <span className="font-sans font-semibold text-base text-foreground tracking-[-0.01em]">
            SFab
          </span>
          <span className="font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.18em]">
            Bench
          </span>
        </a>
        <div className="flex items-center gap-3">
          <Mono
            asChild
            caps
            className="hidden tracking-[0.16em] transition-colors hover:text-foreground sm:inline"
            size="sm"
          >
            <a href={GITHUB} rel="noreferrer" target="_blank">
              GitHub
            </a>
          </Mono>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
