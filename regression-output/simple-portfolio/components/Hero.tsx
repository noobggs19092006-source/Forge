'use client';
import styles from './Hero.module.css';
import '../app/globals.css';
import { useLenis } from '../hooks/useLenis';
import useReducedMotion from '../hooks/useReducedMotion';
import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { gsapConfig } from '../lib/gsap-config';
const Hero: React.FC<{ id?: string }> = ({ id }) => {
  const prefersReducedMotion = useReducedMotion();
  const lenisRef = useRef<Lenis | null>(null);
  const heroSectionRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (lenisRef.current) return;

    const lenisNewInstance = new Lenis({
      duration: gsapConfig.defaultDuration,
      easing: gsapConfig.defaultEasing,
      smoothWheel: true,
    });

    setLenis(lenisNewInstance);

    function raf(time: number) {
      if (lenis && lenis.raf) lenis.raf(time);
      window.requestAnimationFrame(raf);
    }

    window.requestAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const heroSection = heroSectionRef.current;
    const title = titleRef.current;

    if (!heroSection || !title) return;

    gsap.to(heroSection, { duration: gsapConfig.defaultDuration, opacity: 1 });
    ScrollTrigger.create({
      trigger: heroSection,
      start: 'top center',
      end: 'bottom top',
      onEnter: () => {
        gsap.from(title, { duration: gsapConfig.defaultDuration / 2, opacity: 0, y: -50 });
      },
    });

    return () => ScrollTrigger.killAll();
  }, []);

  if (prefersReducedMotion) {
    return (
      <div className={styles.heroContainer} ref={heroSectionRef} id={id || 'hero'}>
        <h1 className={styles['hero-title']} ref={titleRef}>Hello, World!</h1>
        <p className={styles['hero-subtitle']}>Welcome to our website.</p>
      </div>
    );
  }

  return (
    <LenisContext.Consumer>
      {lenis => {
        if (!lenis) return null;

        return (
          <div className={styles.heroContainer} ref={heroSectionRef} id={id || 'hero'} style={{ scrollBehavior: lenisNewInstance ? 'smooth' : 'auto' }}>
            <h1 className={styles['hero-title']} ref={titleRef}>Hello, World!</h1>
            <p className={styles['hero-subtitle']}>Welcome to our website.</p>
          </div>
        );
      }}
    </LenisContext.Consumer>
  );
};

export default Hero;