'use client';
import React from 'react';
import styles from './PortfolioItems.module.css';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import useReducedMotion from '../hooks/useReducedMotion';
import { gsapConfig } from '../lib/gsap-config';
import { useEffect } from "react";

// components/PortfolioItems.tsx
interface Props {
  id?: string;
}

const PortfolioItems: React.FC<Props> = ({ id }) => {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!reducedMotion) {
      gsap.to('.portfolio-item', {
        scrollTrigger: {
          trigger: '.portfolio-items',
          start: 'top center',
          end: 'bottom bottom',
          scrub: true,
        },
        y: -100,
        duration: gsapConfig.defaultDuration,
      });
    }
  }, [reducedMotion]);

  return (
    <section id={id} className={styles['portfolio-items']}>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className={styles['portfolio-item']}>
          <img src={`/images/project-${index + 1}.jpg`} alt={`Project ${index + 1}`} className={styles['portfolio-image']} />
        </div>
      ))}
    </section>
  );
};

export default PortfolioItems;