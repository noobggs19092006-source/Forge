'use client';
import React from 'react';
import Link from 'next/link';
import LenisProvider from '../lib/lenis-provider';
import styles from './Navbar.module.css';
import { useEffect } from "react";
import gsap from "gsap";

// use client;

interface Props {
  id?: string;
}

const Navbar: React.FC<Props> = ({ id }) => {
  const pathname = usePathname();

  useEffect(() => {
    gsap.to('.nav-link', { duration: 0.3, opacity: 1 });
  }, []);

  return (
    <header className={styles.navbar}>
      <Link href="/" passHref>
        <a className={`${styles['navbar-brand']} ${pathname === '/' ? styles.active : ''}`}>Home</a>
      </Link>
      <nav className={styles['navbar-links']}>
        {id && id !== 'home' && (
          <Link href="/about" passHref>
            <a
              className={`${styles['nav-link']} ${pathname === '/about' ? styles.active : ''}`}
              aria-current={pathname === '/about' ? 'page' : undefined}
            >About</a>
          </Link>
        )}
      </nav>
    </header>
  );
};

export default Navbar;