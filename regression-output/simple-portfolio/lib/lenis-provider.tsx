'use client';
import Lenis from 'lenis';
import { gsapConfig } from '../lib/gsap-config';
import React, { createContext, useContext, useEffect, useState } from 'react';
export const LenisContext = createContext<Lenis | null>(null);

interface LenisProviderProps {
  children: React.ReactNode;
}

const LenisProvider: React.FC<LenisProviderProps> = ({ children }) => {
  const [lenis, setLenis] = useState<Lenis | null>(null);

  useEffect(() => {
    if (!lenis) {
      const lenisInstance = new Lenis({
        duration: 0.6,
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
      });

      setLenis(lenisInstance);
    }

    return () => {
      lenis?.destroy();
    };
  }, []);

  useEffect(() => {
    if (lenis) {
      const raf = (time: number) => {
        lenis.raf(time);
        requestAnimationFrame(raf);
      };

      requestAnimationFrame(raf);
    }
  }, [lenis]);

  return (
    <LenisContext.Provider value={lenis}>
      <div style={{ height: '100vh', overflowY: 'auto' }}>{children}</div>
    </LenisContext.Provider>
  );
};

export default LenisProvider;