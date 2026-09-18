'use client';
import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export const defaultEasing = "power2.out";
export const defaultDuration = 0.4;
export const staggerInterval = 0.05;

export function setupGSAP(): void {
  gsap.defaults({
    ease: defaultEasing,
    duration: defaultDuration,
  });

  gsap.matchMedia().add("(prefers-reduced-motion: reduce)", () => {
    gsap.ticker.fps(1);
  });

  ScrollTrigger.config({
    ignoreMobileResize: true,
  });
}

export function GSAPInitializer(): null {
  useEffect(() => {
    setupGSAP();

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
      gsap.killTweensOf("*");
    };
  }, []);

  return null;
}

export default GSAPInitializer;