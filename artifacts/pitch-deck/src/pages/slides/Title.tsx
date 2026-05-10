const base = import.meta.env.BASE_URL;

export default function Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <img
        src={`${base}hero.png`}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover"
        alt="Traveler scanning a foreign menu"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/55 to-ink/10" />

      <div className="absolute top-[6vh] left-[6vw] right-[6vw] flex items-center justify-between text-bg">
        <div className="flex items-center gap-[1.2vw]">
          <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-safe" />
          <span className="font-body font-semibold tracking-[0.3em] text-[1.4vw] uppercase">
            Allergy Travel Scanner
          </span>
        </div>
        <span className="font-body text-[1.4vw] opacity-70">Hackathon · 2026</span>
      </div>

      <div className="absolute left-[6vw] bottom-[10vh] max-w-[70vw] text-bg">
        <p className="font-body text-[1.5vw] tracking-[0.25em] uppercase opacity-80">
          Eat safely in any language
        </p>
        <h1 className="font-display text-[8.5vw] leading-[0.92] tracking-tight mt-[2vh] text-balance">
          Travel hungry.
          <span className="block italic text-safe">Eat fearless.</span>
        </h1>
        <p className="font-body text-[1.6vw] opacity-80 mt-[3vh] max-w-[50vw]">
          Point your camera at a menu. We translate, screen, and explain every
          dish against your allergies — in seconds.
        </p>
        <p className="font-body text-[1.2vw] tracking-[0.3em] uppercase mt-[5vh] text-bg/70">
          Presented by Team Allergy Travel Scanner
        </p>
      </div>
    </div>
  );
}
