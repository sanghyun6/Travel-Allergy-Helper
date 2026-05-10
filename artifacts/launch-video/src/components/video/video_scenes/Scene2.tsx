import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000), // phone enters
      setTimeout(() => setPhase(3), 3500), // scan line
      setTimeout(() => setPhase(4), 5000), // pin 1
      setTimeout(() => setPhase(5), 6000), // pin 2
      setTimeout(() => setPhase(6), 7000), // pin 3
      setTimeout(() => setPhase(7), 10500), // exit
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-between px-24 bg-[var(--color-bg-dark)] text-[var(--color-text-inverse)]"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -100 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background image slightly faded */}
      <motion.div 
        className="absolute inset-0 opacity-20"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 12, ease: "linear" }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}restaurant-bg.png`} 
          alt="Restaurant" 
          className="w-full h-full object-cover grayscale"
        />
      </motion.div>

      <div className="relative z-10 w-1/2 pr-12">
        <motion.h2
          className="text-6xl md:text-8xl font-display leading-[1.1] text-[#F5EFE6]"
          initial={{ opacity: 0, x: -40 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          Your phone becomes <span className="italic text-[var(--color-success)]">your allergist</span> at the table.
        </motion.h2>
      </div>

      <div className="relative z-10 w-[400px] h-[700px]">
        <motion.div
          className="absolute inset-0 bg-black rounded-[3rem] border-[8px] border-[#333] shadow-2xl overflow-hidden"
          initial={{ y: "100%", opacity: 0, rotate: 10 }}
          animate={phase >= 2 ? { y: 0, opacity: 1, rotate: 0 } : { y: "100%", opacity: 0, rotate: 10 }}
          transition={{ duration: 1.2, type: "spring", bounce: 0.2 }}
        >
          <img 
            src={`${import.meta.env.BASE_URL}menu-bg.png`} 
            alt="Spanish Menu" 
            className="w-full h-full object-cover opacity-80"
          />

          {/* Menu Items overlay to simulate AR */}
          <div className="absolute inset-0 flex flex-col pt-32 px-8 gap-12">
            
            {/* Item 1 */}
            <div className="relative">
              <p className="text-xl font-display text-white drop-shadow-md">Tortilla de gambas</p>
              <motion.div
                className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-[var(--color-error)] shadow-[0_0_15px_var(--color-error)]"
                initial={{ scale: 0, opacity: 0 }}
                animate={phase >= 4 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                transition={{ type: "spring", bounce: 0.5 }}
              />
              {phase >= 4 && (
                <motion.div
                  className="absolute left-0 -top-6 bg-[var(--color-error)] text-white text-xs px-2 py-1 rounded font-bold uppercase tracking-wider"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  Shellfish
                </motion.div>
              )}
            </div>

            {/* Item 2 */}
            <div className="relative">
              <p className="text-xl font-display text-white drop-shadow-md">Patatas bravas</p>
              <motion.div
                className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-[var(--color-success)] shadow-[0_0_15px_var(--color-success)]"
                initial={{ scale: 0, opacity: 0 }}
                animate={phase >= 5 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                transition={{ type: "spring", bounce: 0.5 }}
              />
            </div>

            {/* Item 3 */}
            <div className="relative">
              <p className="text-xl font-display text-white drop-shadow-md">Crema catalana</p>
              <motion.div
                className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-[var(--color-warning)] shadow-[0_0_15px_var(--color-warning)]"
                initial={{ scale: 0, opacity: 0 }}
                animate={phase >= 6 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                transition={{ type: "spring", bounce: 0.5 }}
              />
              {phase >= 6 && (
                <motion.div
                  className="absolute left-0 -top-6 bg-[var(--color-warning)] text-white text-xs px-2 py-1 rounded font-bold uppercase tracking-wider"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  Dairy
                </motion.div>
              )}
            </div>

          </div>

          {/* Scanner Line */}
          {phase >= 3 && (
            <motion.div
              className="absolute left-0 right-0 h-1 bg-[var(--color-success)] shadow-[0_0_20px_var(--color-success)]"
              initial={{ top: "0%" }}
              animate={{ top: "100%" }}
              transition={{ duration: 3, ease: "linear" }}
            />
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}