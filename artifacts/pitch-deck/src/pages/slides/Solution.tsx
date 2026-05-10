export default function Solution() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink">
      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[2vw] h-[0.25vh] bg-safe" />
        <span className="font-body font-semibold tracking-[0.3em] text-[1.2vw] uppercase text-muted">
          02 · The solution
        </span>
      </div>

      <div className="absolute top-[16vh] left-[6vw] right-[6vw] grid grid-cols-12 gap-[3vw] items-center">
        <div className="col-span-6">
          <h2 className="font-display text-[6.5vw] leading-[0.95] tracking-tight">
            Your phone becomes
            <span className="italic text-safe"> your allergist</span> at the table.
          </h2>
          <p className="font-body text-[1.8vw] leading-snug mt-[4vh] text-muted max-w-[36vw]">
            Hold up the camera. Every dish gets a colored pin: safe, caution, or
            avoid — with a tappable explanation in plain language.
          </p>

          <div className="mt-[5vh] flex items-center gap-[2vw]">
            <div className="flex items-center gap-[0.8vw]">
              <div className="w-[1.4vw] h-[1.4vw] rounded-full bg-safe" />
              <span className="font-body font-semibold text-[1.4vw]">Safe</span>
            </div>
            <div className="flex items-center gap-[0.8vw]">
              <div className="w-[1.4vw] h-[1.4vw] rounded-full bg-warn" />
              <span className="font-body font-semibold text-[1.4vw]">Caution</span>
            </div>
            <div className="flex items-center gap-[0.8vw]">
              <div className="w-[1.4vw] h-[1.4vw] rounded-full bg-danger" />
              <span className="font-body font-semibold text-[1.4vw]">Avoid</span>
            </div>
          </div>
        </div>

        <div className="col-span-6 flex justify-center">
          <div className="relative w-[26vw] h-[58vh] rounded-[2.5vw] bg-ink p-[1vh] shadow-2xl">
            <div className="w-full h-full rounded-[2vw] bg-bg overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-b from-ink/10 via-transparent to-ink/30" />
              <div className="absolute top-[3vh] left-[2vw] right-[2vw]">
                <p className="font-display italic text-[2vw] text-ink/70">Carta</p>
                <p className="font-display text-[2.6vw] leading-tight text-ink">Tortilla de gambas</p>
                <p className="font-display text-[2.6vw] leading-tight text-ink mt-[1.5vh]">Patatas bravas</p>
                <p className="font-display text-[2.6vw] leading-tight text-ink mt-[1.5vh]">Crema catalana</p>
              </div>
              <div className="absolute top-[8vh] right-[1.5vw] flex items-center gap-[0.5vw] bg-danger text-bg px-[0.8vw] py-[0.6vh] rounded-full font-body font-semibold text-[1.1vw] shadow-lg">
                <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-bg" />
                Shellfish
              </div>
              <div className="absolute top-[15vh] right-[1.5vw] flex items-center gap-[0.5vw] bg-safe text-bg px-[0.8vw] py-[0.6vh] rounded-full font-body font-semibold text-[1.1vw] shadow-lg">
                <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-bg" />
                Safe
              </div>
              <div className="absolute top-[22vh] right-[1.5vw] flex items-center gap-[0.5vw] bg-warn text-bg px-[0.8vw] py-[0.6vh] rounded-full font-body font-semibold text-[1.1vw] shadow-lg">
                <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-bg" />
                Dairy
              </div>
              <div className="absolute bottom-[2.5vh] left-[1.5vw] right-[1.5vw] bg-ink text-bg p-[1.5vh] rounded-[1.2vw]">
                <p className="font-body text-[1vw] uppercase tracking-widest opacity-60">Why</p>
                <p className="font-body text-[1.2vw] mt-[0.5vh] leading-snug">
                  Crema catalana contains milk and egg yolk — flagged from your
                  dairy allergy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
