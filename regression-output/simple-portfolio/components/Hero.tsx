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
  const heroContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (lenisRef.current) return;

    const lenisInstance = new Lenis({ duration: gsapConfig.defaultDuration, easing: gsapConfig.defaultEasing });
    lenisRef.current = lenisInstance;

    function raf(time: number) {
      lenis?.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (heroContentRef.current && !prefersReducedMotion) {
      gsap.to(heroContentRef.current, { opacity: 0, y: -50, duration: gsapConfig.defaultDuration * 2, ease: gsapConfig.defaultEasing });

      ScrollTrigger.create({
        trigger: heroContentRef.current,
        start: 'top bottom-=10%',
        end: 'bottom top+=10%'
      });
    }
  }, [heroContentRef, prefersReducedMotion]);

  return (
    <section id={id} className={styles.heroSection}>
      <div ref={heroContentRef} className={styles['hero-content']}>
        <h1 className={styles['hero-title']}>Welcome to My Portfolio</h1>
        <p className={styles['hero-subtitle']}>Explore my works and get inspired!</p>
      </div>
    </section>
  );
};

export default Hero;