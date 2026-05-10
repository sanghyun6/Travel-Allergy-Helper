export default function Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink">
      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[2vw] h-[0.25vh] bg-danger" />
        <span className="font-body font-semibold tracking-[0.3em] text-[1.2vw] uppercase text-muted">
          01 · The problem
        </span>
      </div>

      <div className="absolute top-[18vh] left-[6vw] right-[6vw] grid grid-cols-12 gap-[3vw] items-start">
        <div className="col-span-7">
          <h2 className="font-display text-[7vw] leading-[0.95] tracking-tight">
            A menu in a language you don&apos;t read
            <span className="italic text-danger"> can put you in the ER.</span>
          </h2>
          <p className="font-body text-[2vw] leading-snug mt-[5vh] text-muted max-w-[42vw]">
            Travelers with food allergies face the same broken loop in every
            country: guess, point, hope, and sometimes call an ambulance.
          </p>
        </div>

        <div className="col-span-5 mt-[2vh] flex flex-col gap-[2.5vh]">
          <div className="bg-ink text-bg p-[2.5vh] pl-[2vw]">
            <div className="font-display text-[5vw] leading-none text-warn">32M</div>
            <p className="font-body text-[1.5vw] mt-[1vh] opacity-80">
              Americans live with food allergies — 1 in 10 adults.
            </p>
          </div>
          <div className="border border-ink/15 p-[2.5vh] pl-[2vw]">
            <div className="font-display text-[5vw] leading-none text-danger">200k</div>
            <p className="font-body text-[1.5vw] mt-[1vh] text-muted">
              ER visits a year for severe allergic reactions.
            </p>
          </div>
          <div className="border border-ink/15 p-[2.5vh] pl-[2vw]">
            <div className="font-display text-[5vw] leading-none text-safe">0</div>
            <p className="font-body text-[1.5vw] mt-[1vh] text-muted">
              Tools that read a foreign menu the way an allergist would.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
