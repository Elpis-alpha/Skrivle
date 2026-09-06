import { ClosingCta } from "@/components/landing/ClosingCta";
import { DevBand } from "@/components/landing/DevBand";
import { Faq } from "@/components/landing/Faq";
import { Features } from "@/components/landing/Features";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { OpenSource } from "@/components/landing/OpenSource";
import { RoadmapRail } from "@/components/landing/RoadmapRail";
import { Toolbox } from "@/components/landing/Toolbox";

export default function Page() {
  return (
    <>
      <Hero />
      {/* §13.1 — 96px between bands, 128px at lg. No top padding: the hero
          already ends with its own. OpenSource brings its own padding because
          it is a full-bleed tinted band. */}
      <div className="flex flex-col gap-24 pb-24 lg:gap-32 lg:pb-32">
        <HowItWorks />
        <Features />
        <Toolbox />
        <OpenSource />
        <RoadmapRail />
        <DevBand />
        <Faq />
      </div>
      <ClosingCta />
    </>
  );
}
