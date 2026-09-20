'use client';
import React from "react";
import styles from './Footer.module.css';
interface Props {
  id?: string;
}

const Footer: React.FC<Props> = ({ id }) => (
  <footer className={styles.footer}>
    <p>&copy; {new Date().getFullYear()} Your Name</p>
  </footer>
);

export default Footer;