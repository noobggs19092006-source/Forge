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
        <h2>Our Work</h2>
        <p>Explore our portfolio of projects.</p>
        <PortfolioItems id="portfolio-items" />
      </section>
    </LenisProvider>
  );
}