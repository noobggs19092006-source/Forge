'use client';
import styles from './Hero.module.css';
import '../app/globals.css';
import { useLenis } from '../hooks/useLenis';
import useReducedMotion from '../hooks/useReducedMotion';
import type Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { gsapConfig } from '../lib/gsap-config';
import { useEffect } from "react";

// use client;
interface Props {
  id?: string;
}

const Hero: React.FC<Props> = ({ id }) => {
  const prefersReducedMotion = useReducedMotion();
  const lenisRef = useRef<Lenis | null>(null);
  const heroTitleRef = useRef<HTMLHeadingElement>(null);
  const heroSubtitleRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!lenisRef.current && !prefersReducedMotion) {
      lenisRef.current = new Lenis({ duration: gsapConfig.defaultDuration, easing: gsapConfig.defaultEasing });
    }
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (lenisRef.current && heroTitleRef.current) {
      const tl = gsap.timeline();
      tl.fromTo(heroTitleRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: gsapConfig.defaultDuration });
    }

    if (lenisRef.current && heroSubtitleRef.current) {
      const tl = gsap.timeline();
tl.fromTo(heroSubtitleRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: gsapConfig.defaultDuration });
    }

    return () => {
      if (lenisRef.current) {
        lenisRef.current.destroy();
      }
    };
  }, [heroTitleRef, heroSubtitleRef]);

  return (
    <div className={styles['hero-section']} id={id}>
      <div className={styles['hero-content']}>
        <h1 ref={heroTitleRef} className={styles['hero-title']}>Portfolio</h1>
        <p ref={heroSubtitleRef} className={styles['hero-subtitle']}>Welcome to my digital portfolio.</p>
      </div>
    </div>
  );
};

export default Hero;