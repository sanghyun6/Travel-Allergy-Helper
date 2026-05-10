import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000), // Card appears
      setTimeout(() => setPhase(3), 3500), // Text appears
      setTimeout(() => setPhase(4), 8500), // exit
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-[#D97A1F]"
      initial={{ clipPath: "circle(0% at 50% 50%)" }}
      animate={{ clipPath: "circle(150% at 50% 50%)" }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-black/10" />

      <div className="relative z-10 flex w-full max-w-6xl items-center px-12 gap-16">
        
        <motion.div
          className="w-1/2"
          initial={{ opacity: 0, x: -40 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
          transition={{ duration: 1 }}
        >
          <h2 className="text-6xl md:text-8xl font-display text-white leading-[1.1]">
            A polite card the kitchen can <span className="italic text-[#0E2A2A]">act on.</span>
          </h2>
        </motion.div>

        <motion.div
          className="w-1/2 flex justify-center"
          initial={{ opacity: 0, y: 100, rotate: -5 }}
          animate={phase >= 2 ? { opacity: 1, y: 0, rotate: 2 } : { opacity: 0, y: 100, rotate: -5 }}
          transition={{ duration: 1, type: "spring", bounce: 0.3 }}
        >
          <div className="bg-[#F5EFE6] rounded-2xl shadow-2xl p-10 w-[450px] border border-white">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-[#C0432B] flex items-center justify-center text-white font-bold text-2xl">!</div>
              <h3 className="text-3xl font-display text-[#0E2A2A]">Alergia Severa</h3>
            </div>
            
            <p className="text-xl text-[#0E2A2A] font-bold mb-4">
              Soy alérgico a los mariscos.
            </p>
            
            <p className="text-lg text-[#6F6A60] mb-8 leading-relaxed">
              Por favor, asegúrese de que mi comida no contenga gambas, langosta, cangrejo, o cualquier otro marisco, y que no haya contaminación cruzada.
            </p>

            <div className="h-px w-full bg-[#6F6A60]/20 mb-6" />
            
            <p className="text-sm font-bold text-[#D97A1F] uppercase tracking-widest text-center">
              Allergy Travel Scanner
            </p>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}