'use client';
import styles from './Hero.module.css';
import '../app/globals.css';
import { useLenis } from '../hooks/useLenis';
import useReducedMotion from '../hooks/useReducedMotion';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { gsapConfig } from '../lib/gsap-config';
const Hero: React.FC<{ id?: string }> = ({ id }) => {
  const prefersReducedMotion = useReducedMotion();
  const lenisRef = useRef<Lenis | null>(null);
  const heroTitleRef = useRef<HTMLHeadingElement>(null);
  const heroSubtitleRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (lenisRef.current) return;

    gsapConfig.staggerInterval = 0.2;
    gsap.defaults({ ease: gsapConfig.defaultEasing, duration: gsapConfig.defaultDuration });

    const lenis = new Lenis();
    lenisRef.current = lenis;

    ScrollTrigger.create({
      trigger: '.hero-section',
      start: 'top top',
      end: '+=100%',
      scrub: true,
      onEnter() {
        gsap.to(heroTitleRef.current, { opacity: 1 });
        gsap.fromTo(
          heroSubtitleRef.current,
          { opacity: 0 },
          { opacity: 1 }
        );
      },
    });

    return () => {
      lenis.destroy();
    };
  }, []);

  if (prefersReducedMotion) {
    return (
      <div className={styles['hero-section']} id={id}>
        <div className={styles['hero-text-container']}>
          <h1 ref={heroTitleRef} className={styles['hero-title']}>Welcome to Our Site</h1>
          <p ref={heroSubtitleRef} className={styles['hero-subtitle']}>Explore our amazing features!</p>
        </div>
      </div>
    );
  }

  return (
    <LenisProvider>
      <div className={styles['hero-section']} id={id}>
        <div className={styles['hero-text-container']}>
          <h1 ref={heroTitleRef} className={styles['hero-title']}>Welcome to Our Site</h1>
          <p ref={heroSubtitleRef} className={styles['hero-subtitle']}>Explore our amazing features!</p>
        </div>
      </div>
    </LenisProvider>
  );
};

export default Hero;