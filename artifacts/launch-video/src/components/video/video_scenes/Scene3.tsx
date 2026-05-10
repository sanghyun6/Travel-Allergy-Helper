import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000), // Step 1
      setTimeout(() => setPhase(3), 5000), // Step 2
      setTimeout(() => setPhase(4), 8000), // Step 3
      setTimeout(() => setPhase(5), 13500), // exit
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--color-bg-light)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: "blur(20px)" }}
      transition={{ duration: 1 }}
    >
      <motion.h2
        className="absolute top-20 text-5xl font-display text-[var(--color-primary)]"
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
      >
        Three steps from photo to <span className="italic">verdict.</span>
      </motion.h2>

      <div className="relative w-full max-w-6xl flex justify-between items-center px-12 mt-20">
        
        {/* Connection Line */}
        <motion.div 
          className="absolute top-1/2 left-[10%] right-[10%] h-0.5 bg-[var(--color-secondary)]/30 -z-10"
          initial={{ scaleX: 0 }}
          animate={phase >= 2 ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 2, ease: "easeInOut" }}
          style={{ originX: 0 }}
        />

        {/* Step 1 */}
        <motion.div
          className="flex flex-col items-center w-1/3"
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, type: "spring" }}
        >
          <div className="w-32 h-32 rounded-2xl bg-white shadow-xl flex items-center justify-center border border-[var(--color-bg-muted)] relative overflow-hidden">
             <motion.div 
               className="absolute inset-0 bg-[var(--color-primary)]/5"
               animate={{ y: ["0%", "100%", "0%"] }}
               transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
             />
             <span className="text-4xl font-display text-[var(--color-primary)]">OCR</span>
          </div>
          <div className="mt-8 text-center bg-white/80 px-6 py-4 rounded-xl border border-white">
            <h3 className="text-sm font-bold tracking-widest text-[var(--color-secondary)] mb-2 uppercase">Step 01</h3>
            <p className="text-2xl font-display text-[var(--color-primary)]">Camera reads<br/>the menu</p>
          </div>
        </motion.div>

        {/* Step 2 */}
        <motion.div
          className="flex flex-col items-center w-1/3"
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, type: "spring" }}
        >
          <div className="w-32 h-32 rounded-full bg-[var(--color-primary)] shadow-xl flex items-center justify-center text-white relative">
            <motion.div 
              className="absolute inset-0 rounded-full border-2 border-[var(--color-primary)]"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-3xl font-display">AI + Graph</span>
          </div>
          <div className="mt-8 text-center bg-white/80 px-6 py-4 rounded-xl border border-white">
            <h3 className="text-sm font-bold tracking-widest text-[var(--color-secondary)] mb-2 uppercase">Step 02</h3>
            <p className="text-2xl font-display text-[var(--color-primary)]">Translate &<br/>Cross-reference</p>
          </div>
        </motion.div>

        {/* Step 3 */}
        <motion.div
          className="flex flex-col items-center w-1/3"
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, type: "spring" }}
        >
          <div className="w-32 h-32 rounded-2xl bg-white shadow-xl flex items-center justify-center border-4 border-[var(--color-error)]">
            <motion.div 
               className="w-12 h-12 rounded-full bg-[var(--color-error)] shadow-[0_0_20px_var(--color-error)]"
               animate={{ scale: [1, 1.2, 1] }}
               transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>
          <div className="mt-8 text-center bg-white/80 px-6 py-4 rounded-xl border border-white">
            <h3 className="text-sm font-bold tracking-widest text-[var(--color-error)] mb-2 uppercase">Step 03</h3>
            <p className="text-2xl font-display text-[var(--color-primary)]">Risk pins &<br/>Citations</p>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}