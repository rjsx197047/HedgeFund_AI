import { useEffect } from 'react';
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { Trust } from './components/Trust';
import { Features } from './components/Features';
import { Agents } from './components/Agents';
import { Scorecard } from './components/Scorecard';
import { Providers } from './components/Providers';
import { Privacy } from './components/Privacy';
import { GetStarted } from './components/GetStarted';
import { Footer } from './components/Footer';

/** Scroll-reveal: progressive enhancement. Without JS, .reveal stays visible. */
function useReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
    if (!('IntersectionObserver' in window) || els.length === 0) return;

    root.classList.add('js');
    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            obs.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function App() {
  useReveal();
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <Trust />
        <Features />
        <Agents />
        <Scorecard />
        <Providers />
        <Privacy />
        <GetStarted />
      </main>
      <Footer />
    </>
  );
}

export default App;
