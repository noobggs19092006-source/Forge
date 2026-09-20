'use client';
import Footer from '../components/Footer';
import About from '../components/About';
import LenisProvider from '../lib/lenis-provider'
import Hero from '../components/Hero'
import Navbar from '../components/Navbar'

const page = () => {
  return (
    <LenisProvider>
      <div className='flex flex-col items-center justify-center min-h-screen'>
        <Navbar id='home' />
        <Hero id='hero' />
      </div>
    </LenisProvider>
  )
}

export default page