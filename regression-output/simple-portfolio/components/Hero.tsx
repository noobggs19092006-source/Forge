'use client';
import styles from './Hero.module.css';
import '../app/globals.css';
import { useLenis } from '../hooks/useLenis';
import useReducedMotion from '../hooks/useReducedMotion';
import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { gsapConfig } from '../lib/gsap-config';
interface Props {
  id?: string;
}

const Hero: React.FC<Props> = ({ id }) => {
  const prefersReducedMotion = useReducedMotion();
  const lenisRef = useRef<Lenis | null>(null);
  const heroTitleRef = useRef<HTMLHeadingElement>(null);
  const heroSubtitleRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (lenisRef.current) return;

    const lenis = new Lenis({ duration: gsapConfig.defaultDuration, easing: gsapConfig.defaultEasing });
    lenisRef.current = lenis;

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || !heroTitleRef.current || !heroSubtitleRef.current) return;

    gsap.to(heroTitleRef.current, {
      scrollTrigger: { trigger: heroTitleRef.current, start: 'top center', end: 'bottom center' },
      opacity: 1,
      y: -20,
      duration: gsapConfig.defaultDuration,
      ease: gsapConfig.defaultEasing
    });

    gsap.to(heroSubtitleRef.current, {
      scrollTrigger: { trigger: heroSubtitleRef.current, start: 'top center', end: 'bottom center' },
      scale: 1,
      duration: gsapConfig.defaultDuration,
      ease: gsapConfig.defaultEasing
    });
  }, [prefersReducedMotion]);

  return (
    <div className={styles['hero-section']} id={id || 'hero'}>
      <h1 ref={heroTitleRef} className={styles['hero-title']}>Welcome to My Portfolio</h1>
      <p ref={heroSubtitleRef} className={styles['hero-subtitle']}>A showcase of my work and skills.</p>
    </div>
  );
};

export default Hero;