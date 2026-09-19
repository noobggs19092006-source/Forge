'use client';
import Hero from '../../components/Hero';
import React from 'react';
import { useContext } from 'react';
import LenisContext from '../../lib/lenis-provider';

import CtaSection from '../../components/CtaSection';
import ProjectOverview from '../../components/ProjectOverview';

const Page: React.FC<{ params: { slug: string } }> = ({ params }) => {
  const lenisInstance = useContext(LenisContext);

  return (
    <main className={'page-container'}>
      <HeroSection id='hero' />
      <CtaSection id='cta' />
      <ProjectOverview id='project-overview' slug={params.slug} />
      <StatsSection id='stats' />
    </main>
  );
};

export default Page;