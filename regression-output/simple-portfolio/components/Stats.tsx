'use client';
import React, { useEffect, useRef } from 'react';
import styles from './Stats.module.css';
import gsap from 'gsap';
import { gsapConfig } from '../lib/gsap-config';

import { ScrollTrigger } from 'gsap/ScrollTrigger';
import useReducedMotion from '../hooks/useReducedMotion';
import { useLenis } from '../hooks/useLenis';

// components/Stats.tsx
interface Props {
  id?: string;
}

const Stats: React.FC<Props> = ({ id }) => {
  const statsRef = useRef<HTMLDivElement>(null);
  const lenis = useLenis();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (statsRef.current && !reducedMotion) {
      gsap.to(statsRef.current, {
        scrollTrigger: {
          trigger: statsRef.current,
          start: 'top center',
          end: 'bottom bottom',
          scrub: true,
        },
        yPercent: -100,
        duration: gsapConfig.defaultDuration,
      });
    }
  }, [statsRef, lenis, reducedMotion]);

  return (
    <section id={id} className={styles['stats-section']}>
      <div ref={statsRef} className={styles['stats-container']} >
        <div className={styles['stat-item']} >
          <span className={styles['stat-label']} >Projects Completed</span>
          <span className={styles['stat-value']} data-scroll-trigger="true" style={{ '--value': '50' }}>50</span>
        </div>
        <div className={styles['stat-item']}>
          <span className={styles['stat-label']}>Lines of Code Written</span>
          <span className={styles['stat-value']} data-scroll-trigger="true" style={{ '--value': '10,000' }}>10,000</span>
        </div>
      </div>
    </section>
  );
};

export default Stats;