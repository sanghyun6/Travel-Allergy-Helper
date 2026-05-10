export default function HowItWorks() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink">
      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[2vw] h-[0.25vh] bg-accent" />
        <span className="font-body font-semibold tracking-[0.3em] text-[1.2vw] uppercase text-muted">
          04 · How it works
        </span>
      </div>

      <div className="absolute top-[16vh] left-[6vw] right-[6vw]">
        <h2 className="font-display text-[6vw] leading-[0.95] tracking-tight max-w-[55vw]">
          Three steps from photo to <span className="italic text-safe">verdict.</span>
        </h2>
      </div>

      <div className="absolute bottom-[10vh] left-[6vw] right-[6vw] grid grid-cols-3 gap-[2vw] items-stretch">
        <div className="bg-bg border border-ink/15 p-[3vh] pl-[2vw] flex flex-col justify-between min-h-[42vh]">
          <div>
            <p className="font-body text-[1.2vw] tracking-[0.3em] uppercase text-muted">Step 01</p>
            <p className="font-display text-[3.6vw] leading-tight mt-[1vh]">Camera</p>
          </div>
          <p className="font-body text-[1.5vw] leading-snug text-muted mt-[3vh]">
            On-device OCR isolates dish names, prices, and ingredient hints
            from any photo in any language.
          </p>
        </div>

        <div className="bg-ink text-bg p-[3vh] pl-[2vw] flex flex-col justify-between min-h-[42vh]">
          <div>
            <p className="font-body text-[1.2vw] tracking-[0.3em] uppercase text-bg/50">Step 02</p>
            <p className="font-display text-[3.6vw] leading-tight mt-[1vh] text-warn">Gemini + Graph</p>
          </div>
          <p className="font-body text-[1.5vw] leading-snug text-bg/80 mt-[3vh]">
            Gemini 2.0 Flash translates each dish, then walks our
            ingredient knowledge graph for hidden allergens and contamination
            risks.
          </p>
        </div>

        <div className="bg-bg border border-ink/15 p-[3vh] pl-[2vw] flex flex-col justify-between min-h-[42vh]">
          <div>
            <p className="font-body text-[1.2vw] tracking-[0.3em] uppercase text-muted">Step 03</p>
            <p className="font-display text-[3.6vw] leading-tight mt-[1vh] text-safe">Risk pins</p>
          </div>
          <p className="font-body text-[1.5vw] leading-snug text-muted mt-[3vh]">
            Each dish gets a colored pin and a citation chain — every claim
            traces back to a source the user can read.
          </p>
        </div>
      </div>
    </div>
  );
}
