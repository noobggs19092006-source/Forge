'use client';
import Lenis from 'lenis';
import gsap from 'gsap';
import { createContext, useContext, useEffect, useState } from 'react';
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

      return () => {
        lenisInstance.destroy();
      };
    }
  }, []);

  useEffect(() => {
    if (lenis) {
      const scrollHandler = ({ scroll }) => {
        // handler body
      };

      lenis.on('scroll', scrollHandler);

      return () => {
        lenis.off('scroll', scrollHandler);
      };
    }
  }, [lenis]);

  return (
    <LenisContext.Provider value={lenis}>
      <div style={{ height: '100vh', overflowY: 'auto' }}>{children}</div>
    </LenisContext.Provider>
  );
};

export default LenisProvider;