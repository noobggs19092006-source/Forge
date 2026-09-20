'use client';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// lib/gsap-config.ts
gsap.registerPlugin(ScrollTrigger);
const defaultEasing = "power3.out";
const defaultDuration = 0.6;
staggerInterval: number;
export const gsapConfig = {
  defaultEasing,
  defaultDuration,
  staggerInterval
};
function setupGSAP() {
  gsap.defaults({ ease: defaultEasing, duration: defaultDuration });
  gsap.matchMedia().add("(prefers-reduced-motion: reduce)", () => { gsap.ticker.fps(1); });
}
export { setupGSAP };
