'use client';
import Footer from '../components/Footer';
import LenisProvider from '../lib/lenis-provider';
import Hero from '../components/Hero';
import PortfolioItems from '../components/PortfolioItems';
export default function Home() {
  return (
    <LenisProvider>
      <Hero id="hero" />
      <section className='portfolio-section'>
        <h2>My Portfolio</h2>
        <div className='grid-container' data-scroll-enter>
          <PortfolioItems id="portfolio-items" />
        </div>
      </section>
    </LenisProvider>
  );
}