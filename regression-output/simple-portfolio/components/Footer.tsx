import React from 'react';
import styles from './Footer.module.css';

// use client;

interface Props {
  id?: string;
}

const Footer: React.FC<Props> = ({ id }) => (
  <footer className={styles.footer}>
    <div className={styles['footer-text']}>© 2023 Your Company</div>
  </footer>
);

export default Footer;