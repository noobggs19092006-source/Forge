'use client';
import styles from './Hero.module.css';
import '../app/globals.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { gsapConfig } from '../../lib/gsap-config';
import { useEffect } from "react";

// use client;
interface Props {
  id?: string;
}

const Hero: React.FC<Props> = ({ id }) => {
  const prefersReducedMotion = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (heroRef.current && !prefersReducedMotion) {
      gsap.to(heroRef.current, {
        scrollTrigger: { trigger: heroRef.current },
        duration: gsapConfig.defaultDuration,
        ease: gsapConfig.defaultEasing,
        y: -50,
        opacity: 1
      });
    }
  }, [heroRef, prefersReducedMotion]);

  return (
    <div ref={heroRef} className={styles['hero-section']}>
      <div className={styles['hero-content']}>
        <h2 className={styles['hero-title']} id={`${id}-title`}>Welcome to Our Site</h2>
        <p className={styles['hero-subtitle']} id={`${id}-subtitle`} data-scroll-trigger="true">Scroll down for more information.</p>
      </div>
    </div>
  );
};

export default Hero;