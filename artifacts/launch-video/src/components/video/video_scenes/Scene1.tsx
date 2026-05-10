import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => setPhase(4), 5000),
      setTimeout(() => setPhase(5), 7000), // exit
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg-light)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 1 }}
    >
      <div className="absolute inset-0 overflow-hidden opacity-10">
         <motion.div 
           className="absolute w-[80vw] h-[80vw] rounded-full blur-[100px] top-[-20%] right-[-10%]"
           style={{ background: 'var(--color-error)' }}
           animate={{ scale: [1, 1.1, 1], x: [0, -50, 0] }}
           transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
         />
      </div>

      <div className="relative z-10 w-full max-w-5xl px-12">
        <motion.p
          className="text-xl font-bold tracking-widest text-[var(--color-error)] uppercase mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          The Problem
        </motion.p>

        <motion.h1
          className="text-6xl md:text-8xl font-display leading-[1.1] text-[var(--color-primary)] max-w-4xl"
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          A menu in a language you don't read can put you in the <span className="italic text-[var(--color-error)]">ER.</span>
        </motion.h1>

        <div className="mt-16 flex gap-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <p className="text-5xl font-display text-[var(--color-primary)]">32M</p>
            <p className="text-lg text-[var(--color-secondary)]">Americans with food allergies</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={phase >= 4 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <p className="text-5xl font-display text-[var(--color-error)]">200k</p>
            <p className="text-lg text-[var(--color-secondary)]">ER visits per year</p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
