'use client';
import React, { useEffect } from 'react';
import useReducedMotion from '../hooks/useReducedMotion';
import { useLenis } from '../hooks/useLenis';
import { gsapConfig } from '../lib/gsap-config';
import styles from './ProjectOverview.module.css';

// components/ProjectOverview.tsx
interface ProjectItem {
  id: string;
  title: string;
  description: string;
  imageSrc: string;
}

const ProjectOverview: React.FC<{ projects: ProjectItem[] }> = ({ projects }) => {
  const reducedMotion = useReducedMotion();
  const lenis = useLenis();

  useEffect(() => {
    if (lenis) {
      gsap.to(lenis, { duration: 0.6, ease: 'power3.out', onUpdate() { lenis.update() } });
    }
  }, [lenis]);

  return (
    <div className={styles['project-overview-container']}>
      {projects.map((project) => (
        <div key={project.id} className={styles['project-item']} data-scroll-trigger>
          <div className={styles['project-image-container']}>
            <img src={project.imageSrc} alt={project.title} />
          </div>
          <h3 className={styles['project-title']}>{project.title}</h3>
          <p className={styles['project-description']}>{project.description}</p>
        </div>
      ))}
    </div>
  );
};

export default ProjectOverview;