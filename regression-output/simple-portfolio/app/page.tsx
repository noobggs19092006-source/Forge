'use client';
import Stats from '../components/Stats';
import ProjectOverview from '../components/ProjectOverview';
import Cta from '../components/Cta';
import Hero from '../components/Hero';
import LenisProvider from '../lib/lenis-provider'

export default function Home() {
  return (
    <LenisProvider>
      <Hero id="hero" />
      <Cta id="cta" />
      <ProjectOverview id="project-overview" />
      <Stats id="stats" />
    </LenisProvider>
  )
}