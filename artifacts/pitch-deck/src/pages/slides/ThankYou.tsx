export default function ThankYou() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink">
      <div className="absolute top-0 left-0 right-0 h-[1.2vh] bg-safe" />
      <div className="absolute top-[1.2vh] left-0 right-0 h-[0.6vh] bg-warn" />
      <div className="absolute top-[1.8vh] left-0 right-0 h-[0.4vh] bg-danger" />

      <div className="absolute top-[8vh] left-[6vw] flex items-center gap-[1.2vw]">
        <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-safe" />
        <span className="font-body font-semibold tracking-[0.3em] text-[1.3vw] uppercase">
          Allergy Travel Scanner
        </span>
      </div>

      <div className="absolute top-[26vh] left-[6vw] right-[6vw] grid grid-cols-12 gap-[3vw] items-center">
        <div className="col-span-8">
          <p className="font-body text-[1.6vw] tracking-[0.3em] uppercase text-muted">
            Thank you
          </p>
          <h1 className="font-display text-[10vw] leading-[0.9] tracking-tight mt-[2vh]">
            Let&apos;s eat<span className="italic text-safe">.</span>
          </h1>
          <p className="font-body text-[1.8vw] text-muted mt-[3vh] max-w-[44vw]">
            Try it now, or scan to take it on your next trip. Questions
            welcome — especially the hard ones.
          </p>
        </div>

        <div className="col-span-4 flex flex-col items-center gap-[2vh]">
          <div className="w-[20vw] h-[20vw] bg-ink p-[1vw] grid grid-cols-8 grid-rows-8 gap-[0.3vw]">
            <div className="bg-bg col-span-3 row-span-3" />
            <div className="bg-ink col-span-2 row-span-3" />
            <div className="bg-bg col-span-3 row-span-3" />
            <div className="bg-ink col-span-8 row-span-1" />
            <div className="bg-bg col-span-1 row-span-1" />
            <div className="bg-ink col-span-2 row-span-1" />
            <div className="bg-bg col-span-2 row-span-1" />
            <div className="bg-ink col-span-1 row-span-1" />
            <div className="bg-bg col-span-2 row-span-1" />
            <div className="bg-ink col-span-2 row-span-1" />
            <div className="bg-bg col-span-1 row-span-1" />
            <div className="bg-ink col-span-3 row-span-1" />
            <div className="bg-bg col-span-2 row-span-1" />
            <div className="bg-ink col-span-3 row-span-3" />
            <div className="bg-bg col-span-2 row-span-3" />
            <div className="bg-ink col-span-3 row-span-3" />
          </div>
          <p className="font-body text-[1.2vw] tracking-[0.3em] uppercase text-muted">
            Demo · allergy.travel
          </p>
        </div>
      </div>

      <div className="absolute bottom-[6vh] left-[6vw] right-[6vw] flex items-center justify-between text-muted font-body text-[1.2vw]">
        <span>Hackathon · 2026</span>
        <span>Eat safely in any language.</span>
      </div>
    </div>
  );
}
