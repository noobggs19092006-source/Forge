'use client';
import Lenis from 'lenis';
import gsap from 'gsap';
import { createContext, useContext, useEffect } from 'react';
export const LenisContext = createContext<Lenis | null>(null);

interface LenisProviderProps {
  children: React.ReactNode;
}

const LenisProvider: React.FC<LenisProviderProps> = ({ children }) => {
  const [lenis, setLenis] = useState<Lenis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const lenisNewInstance = new Lenis({
        duration: 0.6,
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
      });

      setLenis(lenisNewInstance);

      function raf(time: number) {
        if (lenis && lenis.raf) lenis.raf(time); // <-- closing } for the arrow-function body, then ) for lenis.raf(, then ;
        window.requestAnimationFrame(raf);
      }

      window.requestAnimationFrame(raf);
    }
  }, []);

  return (
    <LenisContext.Provider value={lenis || null}>
      <div style={{ height: '100vh', overflowY: 'auto' }}>{children}</div>
    </LenisContext.Provider>
  );
};

export default LenisProvider;