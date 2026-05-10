export default function Demo() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-ink text-bg">
      <div className="absolute inset-0 opacity-[0.07]">
        <div className="absolute top-[15vh] left-[10vw] w-[40vw] h-[40vw] rounded-full bg-safe blur-3xl" />
        <div className="absolute bottom-[10vh] right-[8vw] w-[30vw] h-[30vw] rounded-full bg-warn blur-3xl" />
      </div>

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw] text-bg/60">
        <div className="w-[1.2vw] h-[1.2vw] rounded-full bg-safe" />
        <span className="font-body font-semibold tracking-[0.3em] text-[1.2vw] uppercase">
          03 · Live demo
        </span>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-[6vw]">
        <p className="font-body text-[1.6vw] tracking-[0.4em] uppercase text-bg/50">
          Switching to the app
        </p>
        <h2 className="font-display text-[16vw] leading-[0.85] tracking-tight mt-[2vh]">
          Demo<span className="italic text-safe">.</span>
        </h2>
        <p className="font-body text-[1.8vw] mt-[2vh] text-bg/70 max-w-[60vw]">
          Spanish tapas menu, real allergy profile, live in the browser.
        </p>
      </div>

      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] grid grid-cols-3 gap-[3vw]">
        <div className="border-t border-bg/20 pt-[2vh]">
          <p className="font-display text-[2.2vw] text-safe">Scan</p>
          <p className="font-body text-[1.3vw] mt-[1vh] text-bg/70">
            Point camera at the menu, watch dishes appear.
          </p>
        </div>
        <div className="border-t border-bg/20 pt-[2vh]">
          <p className="font-display text-[2.2vw] text-warn">Explain</p>
          <p className="font-body text-[1.3vw] mt-[1vh] text-bg/70">
            Tap any pin for a citation chain in plain English.
          </p>
        </div>
        <div className="border-t border-bg/20 pt-[2vh]">
          <p className="font-display text-[2.2vw] text-bg">Order</p>
          <p className="font-body text-[1.3vw] mt-[1vh] text-bg/70">
            Show the waiter the translated, allergy-aware request.
          </p>
        </div>
      </div>
    </div>
  );
}
