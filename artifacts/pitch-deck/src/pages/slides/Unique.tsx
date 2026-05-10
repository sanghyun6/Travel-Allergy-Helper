export default function Unique() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink">
      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[2vw] h-[0.25vh] bg-warn" />
        <span className="font-body font-semibold tracking-[0.3em] text-[1.2vw] uppercase text-muted">
          05 · What&apos;s unique
        </span>
      </div>

      <div className="absolute top-[14vh] left-[6vw] right-[6vw]">
        <h2 className="font-display text-[6vw] leading-[0.95] tracking-tight max-w-[60vw]">
          Four ideas other scanners <span className="italic text-warn">don&apos;t have.</span>
        </h2>
      </div>

      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-x-[3vw] gap-y-[3vh]">
        <div className="flex gap-[1.5vw]">
          <div className="font-display text-[3vw] text-safe leading-none">01</div>
          <div>
            <p className="font-display text-[2.4vw] leading-tight">Citation chains</p>
            <p className="font-body text-[1.3vw] text-muted mt-[1vh] max-w-[28vw]">
              Every risk verdict shows the ingredient → source → rule path that
              produced it. No black-box judgments.
            </p>
          </div>
        </div>

        <div className="flex gap-[1.5vw]">
          <div className="font-display text-[3vw] text-warn leading-none">02</div>
          <div>
            <p className="font-display text-[2.4vw] leading-tight">Cross-contamination engine</p>
            <p className="font-body text-[1.3vw] text-muted mt-[1vh] max-w-[28vw]">
              Detects shared fryers, grill surfaces, and kitchen practices that
              turn a &quot;safe&quot; dish into a hidden risk.
            </p>
          </div>
        </div>

        <div className="flex gap-[1.5vw]">
          <div className="font-display text-[3vw] text-danger leading-none">03</div>
          <div>
            <p className="font-display text-[2.4vw] leading-tight">Personalized risk model</p>
            <p className="font-body text-[1.3vw] text-muted mt-[1vh] max-w-[28vw]">
              Learns your tolerance from past meals and reactions — your
              &quot;safe&quot; is not the same as anyone else&apos;s.
            </p>
          </div>
        </div>

        <div className="flex gap-[1.5vw]">
          <div className="font-display text-[3vw] text-ink leading-none">04</div>
          <div>
            <p className="font-display text-[2.4vw] leading-tight">Show-the-waiter mode</p>
            <p className="font-body text-[1.3vw] text-muted mt-[1vh] max-w-[28vw]">
              One tap turns your allergy profile into a polite, translated
              card the kitchen can actually act on.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
