import { useEffect, useState } from "react";
import { DesktopMock } from "@/components/home/desktop-mock";
import { HairlineGrid } from "@/components/home/hairline-grid";
import { LogoDots } from "@/components/logo-dots";
import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/display";
import { LiveDot } from "@/components/ui/live-dot";
import { Mono } from "@/components/ui/mono";
import { Pill } from "@/components/ui/pill";
import { Rule } from "@/components/ui/rule";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const GITHUB = "https://github.com/sfab-oss/sfab-bench";
const RELEASES = `${GITHUB}/releases`;

const PROVIDERS = [
  { name: "Claude Code", cmd: "claude auth login" },
  { name: "Codex", cmd: "codex login" },
  { name: "Grok", cmd: "grok login" },
  { name: "OpenCode", cmd: "opencode auth login" },
] as const;

export function Hero() {
  return (
    <section className="relative mx-auto w-full max-w-5xl px-6 pt-28 pb-16 md:pt-32">
      <Pill className="mb-8">
        <LiveDot className="animate-blink" />
        CAD workbench
      </Pill>
      <Display className="max-w-3xl text-4xl sm:text-5xl md:text-6xl">
        Open a folder. Open a STEP. Talk.
      </Display>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
        SFab Bench is a CAD workbench that hosts the agents already on your Mac.
        Quest Browser joins the same process over Wi-Fi.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <a href={RELEASES}>Download for macOS</a>
        </Button>
        <Button asChild variant="ghost">
          <a href="#run">How to run</a>
        </Button>
      </div>
      <div className="mt-12">
        <DesktopMock />
      </div>
    </section>
  );
}

export function Thesis() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20">
      <Mono caps className="tracking-[0.2em]" size="xs">
        01 The job
      </Mono>
      <Display className="mt-4 max-w-3xl text-3xl sm:text-4xl">
        Presence, not authoring.
      </Display>
      <p className="mt-6 max-w-2xl text-muted-foreground leading-relaxed">
        Whatever produced the STEP stays wherever it is. This app tessellates
        it, lets you select faces and parts, and puts a coding agent on that
        folder. Mac tab and Quest share recents and chat history. Each client
        keeps its own camera, selection, and live thread.
      </p>
      <HairlineGrid className="mt-10 sm:grid-cols-3">
        {[
          {
            k: "01",
            t: "Folder",
            d: "A directory on the Mac. That is the project and the agent cwd.",
          },
          {
            k: "02",
            t: "STEP or GLB",
            d: "OpenCascade in the local server. No Python, no second tessellator.",
          },
          {
            k: "03",
            t: "Quest",
            d: "Same Wi-Fi, Quest Browser, pair once. Enter Studio on the headset.",
          },
        ].map((cell) => (
          <div className="bg-background p-6" key={cell.k}>
            <Mono caps size="xs" tone="brand">
              {cell.k}
            </Mono>
            <h3 className="mt-3 font-semibold text-lg">{cell.t}</h3>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
              {cell.d}
            </p>
          </div>
        ))}
      </HairlineGrid>
    </section>
  );
}

export function Providers() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20">
      <Mono caps className="tracking-[0.2em]" size="xs">
        02 Bring your own
      </Mono>
      <Display className="mt-4 max-w-3xl text-3xl sm:text-4xl">
        The logins already on the Mac.
      </Display>
      <p className="mt-6 max-w-2xl text-muted-foreground leading-relaxed">
        Bench does not resell tokens. Plug in Claude Code, Codex, Grok, or
        OpenCode with the credentials you already have. Cursor is in the picker;
        a Mac login is not visible to this app yet.
      </p>
      <HairlineGrid className="mt-10 sm:grid-cols-2">
        {PROVIDERS.map((row) => (
          <div
            className="flex items-center justify-between gap-4 bg-background px-5 py-4"
            key={row.name}
          >
            <span className="font-medium text-sm">{row.name}</span>
            <Mono caps size="xs">
              {row.cmd}
            </Mono>
          </div>
        ))}
      </HairlineGrid>
      <p className="mt-6 text-muted-foreground text-sm">
        No keys in this app. If a harness is signed out, the composer shows the
        command to run on the Mac.
      </p>
    </section>
  );
}

export function OpenMac() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20" id="run">
      <Mono caps className="tracking-[0.2em]" size="xs">
        03 Ship
      </Mono>
      <Display className="mt-4 max-w-3xl text-3xl sm:text-4xl">
        A Mac app. A folder. A headset.
      </Display>
      <p className="mt-6 max-w-2xl text-muted-foreground leading-relaxed">
        Unzip the GitHub Release, or clone and{" "}
        <Mono asChild className="text-foreground" size="sm">
          <code>pnpm desktop</code>
        </Mono>
        . The long runbook stays in the repo.
      </p>
      <HairlineGrid className="mt-10 sm:grid-cols-2">
        <div className="bg-background p-6">
          <Mono caps size="xs" tone="brand">
            Mac
          </Mono>
          <h3 className="mt-3 font-semibold text-lg">Open Anyway once</h3>
          <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
            Unzip <code>sfab-bench-*-arm64.app.zip</code> from Releases, drag it
            to Applications, double-click, then System Settings → Privacy &
            Security → Open Anyway. Ad-hoc signed, not notarised yet.
          </p>
        </div>
        <div className="bg-background p-6">
          <Mono caps size="xs" tone="brand">
            Quest
          </Mono>
          <h3 className="mt-3 font-semibold text-lg">Same Wi-Fi</h3>
          <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
            Quest Browser on the same network as the Mac, pair once. Not an APK.
            The Mac tab stays on loopback.
          </p>
        </div>
      </HairlineGrid>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <a href={RELEASES}>Releases</a>
        </Button>
        <Button asChild variant="ghost">
          <a href={GITHUB} rel="noreferrer" target="_blank">
            GitHub
          </a>
        </Button>
      </div>
    </section>
  );
}

export function ManifestoFooter() {
  return (
    <footer className="mx-auto w-full max-w-5xl px-6 pt-16 pb-20">
      <Rule className="mb-10" />
      <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="font-sans font-semibold text-base text-foreground tracking-[-0.01em]">
            SFab Bench
          </span>
          {[
            { label: "GitHub", href: GITHUB },
            { label: "Releases", href: RELEASES },
          ].map((l) => (
            <Mono
              asChild
              caps
              className="tracking-[0.14em] transition-colors hover:text-foreground"
              key={l.label}
              size="md"
            >
              <a
                href={l.href}
                rel="noreferrer"
                target={l.href.startsWith("http") ? "_blank" : undefined}
              >
                {l.label}
              </a>
            </Mono>
          ))}
        </div>
        <ThemeToggle />
      </div>
      <Mono className="mt-12 tracking-[0.18em]" size="sm" tone="muted">
        Born in Mexico City.
      </Mono>
    </footer>
  );
}

export function ManifestoNav() {
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
