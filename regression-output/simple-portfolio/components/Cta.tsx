'use client';
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import styles from './Cta.module.css';
import LenisProvider from '../lib/lenis-provider';
const Cta: React.FC<{ id?: string }> = ({ id }) => {
  return (
    <>
        <div className={styles['cta-section']}>
  <div className={styles['cta-text-container']}>
    <h2 className={styles['cta-title']} data-scroll-trigger>Get in Touch</h2>
    <p className={styles['cta-description']} data-scroll-trigger>Contact us for any inquiries or to learn more about our portfolio.</p>
  </div>
</div>
      </>
  );
};

export default Cta;
