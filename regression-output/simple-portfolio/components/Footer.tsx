import React from 'react';
import styles from './Footer.module.css';

// use client;

interface Props {
  id?: string;
}

const Footer: React.FC<Props> = ({ id }) => (
  <footer className={styles.footer}>
    <div className={styles['copyright']}>{id ? `© ${new Date().getFullYear()} Your Name` : '© 2023 Your Name'}</div>
  </footer>
);

export default Footer;
