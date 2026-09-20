'use client';
import React, { useEffect, useRef } from 'react';
import styles from './PortfolioItems.module.css';
import useReducedMotion from '../hooks/useReducedMotion';
import { gsapConfig } from '../lib/gsap-config';
import type Lenis from 'lenis';

// components/PortfolioItems.tsx
interface PortfolioItem {
  id: string;
  title: string;
  description: string;
}

const PortfolioItems: React.FC<{ items: PortfolioItem[] }> = ({ items }) => {
  const lenisRef = useRef<Lenis | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const lenisInstance = new Lenis({
        duration: gsapConfig.defaultDuration,
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
      });

      lenisRef.current = lenisInstance;

      return () => {
        lenisInstance.destroy();
      };
    }
  }, []);

  useEffect(() => {
    if (lenisRef.current) {
      const scrollHandler = ({ scroll }) => {
        // handler body
      };

      lenisRef.current.on('scroll', scrollHandler);

      return () => {
        lenisRef.current.off('scroll', scrollHandler);
      };
    }
  }, [lenisRef]);

  useEffect(() => {
    if (!reducedMotion) {
      gsap.to('.portfolio-item', {
        opacity: 1,
        stagger: gsapConfig.staggerInterval * (items.length - 1),
        scrollTrigger: {
          trigger: '.portfolio-items',
          start: 'top bottom-=50%',
          end: 'bottom top+=50%',
          scrub: true,
        },
      });
    }
  }, [items, reducedMotion]);

  return (
    <div className={styles['portfolio-items']}>
{items.map((item) => (
<div key={item.id} className={`${styles['portfolio-item']} ${reducedMotion ? '' : 'visible'}`}>{
<h2>{item.title}</h2>
<p>{item.description}</p>
</div>
))}
</div>
  );
};

export default PortfolioItems;