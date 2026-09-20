'use client';
import { useLenis } from '../hooks/useLenis';
import React, { useEffect } from 'react';
import LenisProvider from '../lib/lenis-provider';
import useReducedMotion from '../hooks/useReducedMotion';
import { gsapConfig } from '../lib/gsap-config';
import styles from './About.module.css';

// components/About.tsx
interface Props {
  id?: string;
}

const About: React.FC<Props> = ({ id }) => {
  const reducedMotion = useReducedMotion();
  const lenis = useLenis();

  useEffect(() => {
    if (lenis) {
      gsap.to(`.${styles['hero-title']}`, {
        scrollTrigger: { trigger: `#${id}`, start: 'top center', end: 'bottom top' },
        opacity: 1,
        y: 0,
        duration: gsapConfig.defaultDuration,
        ease: gsapConfig.defaultEasing
      });

      gsap.to(`.${styles.subtitle}`, {
        scrollTrigger: { trigger: `#${id}`, start: 'top center', end: 'bottom top' },
        scale: 1,
        duration: gsapConfig.defaultDuration * 2,
        ease: gsapConfig.defaultEasing
      });
    }
  }, [lenis, id]);

  return (
    <LenisProvider>
      <section className={styles['hero-section']} id={id || 'about'}>
        <h1 className={`${styles['hero-title']} ${reducedMotion ? styles.hidden : ''}`}>Hello, I'm John Doe</h1>
        <p className={`${styles.subtitle} ${reducedMotion ? styles.hidden : ''}`}>I am a passionate developer and designer.</p>
      </section>
    </LenisProvider>
  );
};

export default About;