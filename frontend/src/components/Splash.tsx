import { useEffect, useState } from 'react';
import { ShefWordmark } from './Logo';

// Заставка при загрузке: тёмный фон + вордмарк ШЕФ с анимацией (CSS #splash-screen).
export default function Splash() {
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 1400);
    const t2 = setTimeout(() => setGone(true), 2300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;
  return (
    <div id="splash-screen" className={fading ? 'fade-out' : ''}>
      <div className="splash-logo">
        <ShefWordmark />
      </div>
    </div>
  );
}
