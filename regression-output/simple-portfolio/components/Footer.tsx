import React from 'react';
import styles from './Footer.module.css';

//use client;

interface Props {
  id?: string;
}

const Footer: React.FC<Props> = ({ id }) => (
  <footer className={styles.footer}>
    <p className={styles['on-surface-dark']}>© 2023 Your Company</p>
  </footer>
);

export default Footer;