'use client';
import { useLenis } from '../hooks/useLenis';
import React, { useEffect } from 'react';
import styles from './Navbar.module.css';
import LenisContext from '../lib/lenis-provider';
import gsap from 'gsap';

// use client;

interface Props {
  id?: string;
}

const Navbar: React.FC<Props> = ({ id }) => {
  const lenis = useLenis();

  useEffect(() => {
    if (lenis) {
      // Add your GSAP animation code here for the navbar section
      gsap.to('.nav-link', { duration: 0.5, opacity: 1 });
    }
  }, [lenis]);

  return (
    <header className={styles['navbar-container']}>
      <div className={styles['navbar-brand']}>Brand</div>
      <nav className={styles['nav-menu']} aria-label="Main navigation">
        <a href="#home" className={`${styles['nav-link']} ${id === 'home' ? styles['active-link'] : ''}`} aria-current={id === 'home' ? 'page' : undefined}>Home</a>
        <a href="#about" className={`${styles['nav-link']} ${id === 'about' ? styles['active-link'] : ''}`}>About</a>
        <a href="#projects" className={`${styles['nav-link']} ${id === 'projects' ? styles['active-link'] : ''}`}>Projects</a>
      </nav>
    </header>
  );
};

export default Navbar;
