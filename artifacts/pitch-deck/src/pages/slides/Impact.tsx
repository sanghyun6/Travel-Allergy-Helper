const base = import.meta.env.BASE_URL;

export default function Impact() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-bg">
      <img
        src={`${base}impact.png`}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover"
        alt="Friends sharing a meal at an outdoor restaurant abroad"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/55 to-ink/15" />

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw] text-bg/70">
        <div className="w-[2vw] h-[0.25vh] bg-safe" />
        <span className="font-body font-semibold tracking-[0.3em] text-[1.2vw] uppercase">
          07 · Impact &amp; vision
        </span>
      </div>

      <div className="absolute bottom-[10vh] left-[6vw] right-[6vw] grid grid-cols-12 gap-[3vw] items-end">
        <div className="col-span-7">
          <h2 className="font-display text-[6.5vw] leading-[0.95] tracking-tight">
            Make every menu, in every country,
            <span className="italic text-safe"> readable.</span>
          </h2>
        </div>
        <div className="col-span-5 text-bg/85">
          <p className="font-body text-[1.5vw] leading-snug">
            Today: 32M people in the US alone. Next: native iOS &amp; Android,
            twelve more languages, and a memory of which restaurants you can
            actually trust.
          </p>
          <p className="font-body text-[1.3vw] tracking-[0.25em] uppercase mt-[3vh] text-safe">
            From scary to second nature.
          </p>
        </div>
      </div>
    </div>
  );
}
