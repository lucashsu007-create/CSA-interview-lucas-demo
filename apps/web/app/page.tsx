import { ParticipationConstellation } from "@/components/ParticipationConstellation";
import { SectionRevealRuntime } from "@/components/SectionRevealRuntime";
import { SiteHeader } from "@/components/SiteHeader";
import { EventSnapshot } from "@/components/home/EventSnapshot";
import { Hero } from "@/components/home/Hero";
import { MembershipSection } from "@/components/home/MembershipSection";
import { MomentsSection } from "@/components/home/MomentsSection";
import { SiteFooter } from "@/components/home/SiteFooter";
import { StorySection } from "@/components/home/StorySection";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <StorySection />
        <ParticipationConstellation />
        <MomentsSection />
        <EventSnapshot />
        <MembershipSection />
      </main>
      <SiteFooter />
      <SectionRevealRuntime />
    </>
  );
}
