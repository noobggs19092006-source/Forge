'use client';
import Footer from '../components/Footer';
import LenisProvider from '../lib/lenis-provider';
import Hero from '../components/Hero';
export default function Home() {
  return (
    <LenisProvider>
      <Hero />
    </LenisProvider>
  );
}