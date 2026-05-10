export default function TechStack() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-ink text-bg">
      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw] text-bg/60">
        <div className="w-[2vw] h-[0.25vh] bg-warn" />
        <span className="font-body font-semibold tracking-[0.3em] text-[1.2vw] uppercase">
          06 · Tech stack
        </span>
      </div>

      <div className="absolute top-[16vh] left-[6vw] right-[6vw]">
        <h2 className="font-display text-[6vw] leading-[0.95] tracking-tight max-w-[60vw]">
          Built for <span className="italic text-safe">explainability,</span> not just speed.
        </h2>
      </div>

      <div className="absolute bottom-[10vh] left-[6vw] right-[6vw] grid grid-cols-5 gap-[2vw]">
        <div className="border-t border-bg/20 pt-[2vh]">
          <p className="font-body text-[1.1vw] tracking-[0.25em] uppercase text-bg/50">Vision &amp; LLM</p>
          <p className="font-display text-[2.4vw] mt-[1vh] text-warn leading-tight">Gemini 2.0 Flash</p>
          <p className="font-body text-[1.2vw] mt-[1vh] text-bg/70">Multimodal menu reading and translation.</p>
        </div>
        <div className="border-t border-bg/20 pt-[2vh]">
          <p className="font-body text-[1.1vw] tracking-[0.25em] uppercase text-bg/50">Knowledge</p>
          <p className="font-display text-[2.4vw] mt-[1vh] text-safe leading-tight">100k+ node graph</p>
          <p className="font-body text-[1.2vw] mt-[1vh] text-bg/70">Ingredients, aliases, and contamination links.</p>
        </div>
        <div className="border-t border-bg/20 pt-[2vh]">
          <p className="font-body text-[1.1vw] tracking-[0.25em] uppercase text-bg/50">Streaming</p>
          <p className="font-display text-[2.4vw] mt-[1vh] text-bg leading-tight">SSE pipeline</p>
          <p className="font-body text-[1.2vw] mt-[1vh] text-bg/70">Dishes appear as they&apos;re analyzed.</p>
        </div>
        <div className="border-t border-bg/20 pt-[2vh]">
          <p className="font-body text-[1.1vw] tracking-[0.25em] uppercase text-bg/50">Client</p>
          <p className="font-display text-[2.4vw] mt-[1vh] text-bg leading-tight">React + Capacitor</p>
          <p className="font-body text-[1.2vw] mt-[1vh] text-bg/70">One codebase, web and native camera.</p>
        </div>
        <div className="border-t border-bg/20 pt-[2vh]">
          <p className="font-body text-[1.1vw] tracking-[0.25em] uppercase text-bg/50">Personalization</p>
          <p className="font-display text-[2.4vw] mt-[1vh] text-danger leading-tight">ML risk scoring</p>
          <p className="font-body text-[1.2vw] mt-[1vh] text-bg/70">Per-user thresholds learned from outcomes.</p>
        </div>
      </div>
    </div>
  );
}
