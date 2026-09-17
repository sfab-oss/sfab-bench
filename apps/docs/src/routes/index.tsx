import { createFileRoute } from "@tanstack/react-router";
import {
  Hero,
  OpenMac,
  Providers,
  SiteFooter,
  SiteNav,
} from "@/components/home/sections";
import { VrDemo } from "@/components/home/vr-demo";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="sfab-manifesto min-h-screen" id="top">
      <SiteNav />
      <main>
        <Hero />
        <VrDemo />
        <Providers />
        <OpenMac />
      </main>
      <SiteFooter />
    </div>
  );
}
