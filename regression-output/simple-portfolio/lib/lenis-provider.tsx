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
    if (typeof window !== 'undefined') {
      const lenisInstance = new Lenis({
        duration: 0.6,
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
      });

      setLenis(lenisInstance);

      function raf(time: number) {
        lenis?.raf(time);
        requestAnimationFrame(raf);
      }

      requestAnimationFrame(raf);
    }
  }, []);

  return (
    <div style={{ height: '100vh', overflowY: 'auto' }}>
      {children}
    </div>
  );
};

export default LenisProvider;