import { createFileRoute } from "@tanstack/react-router";
import {
  Hero,
  ManifestoFooter,
  ManifestoNav,
  OpenMac,
  Providers,
  Thesis,
} from "@/components/home/sections";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="sfab-manifesto min-h-screen" id="top">
      <ManifestoNav />
      <main>
        <Hero />
        <Thesis />
        <Providers />
        <OpenMac />
      </main>
      <ManifestoFooter />
    </div>
  );
}
