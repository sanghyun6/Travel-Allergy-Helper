import { useCallback, useRef, useState } from "react";

export type OrderingInstruction = {
  item: string;
  phrase: string;
  pronunciation: string;
};

export type OrderingInstructionError = { item: string; message: string };

export type OrderingInstructionsRequest = {
  items: string[];
  targetLanguage: string;
  restrictions: string[];
  menuLanguage: string;
  extraInstructions?: string;
};

export type OrderingInstructionsStreamState = {
  status: "idle" | "starting" | "streaming" | "done" | "error";
  // Snapshot of the item names that were sent in the active/last run. UI keys
  // off this — not the live cart — so cart mutations during/after a run don't
  // shift indexes and mis-associate translations.
  snapshotItems: string[];
  instructions: Map<number, OrderingInstruction>;
  itemErrors: Map<number, OrderingInstructionError>;
  fullOrderPhrase: string;
  fullOrderError: string | null;
  total: number;
  error: string | null;
};

const initial: OrderingInstructionsStreamState = {
  status: "idle",
  snapshotItems: [],
  instructions: new Map(),
  itemErrors: new Map(),
  fullOrderPhrase: "",
  fullOrderError: null,
  total: 0,
  error: null,
};

function parseEventBlock(
  block: string,
): { event: string; data: string } | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith(":") || line.length === 0) continue;
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? "" : line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (dataLines.length === 0 && event === "message") return null;
  return { event, data: dataLines.join("\n") };
}

const SILENCE_TIMEOUT_MS = 60_000;

type AbortKind = "user-cancel" | "silence-timeout";
interface RunContext {
  ac: AbortController;
  abortKind: AbortKind | null;
}

export function useOrderingInstructionsStream() {
  const [state, setState] = useState<OrderingInstructionsStreamState>(initial);
  // Per-run context held by closure; stale runs cannot mutate newer-run state.
  const runRef = useRef<RunContext | null>(null);

  const cancel = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    run.abortKind = "user-cancel";
    try {
      run.ac.abort();
    } catch {
      /* ignore */
    }
    runRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState(initial);
  }, [cancel]);

  const start = useCallback(
    async (req: OrderingInstructionsRequest) => {
      cancel();
      const run: RunContext = { ac: new AbortController(), abortKind: null };
      runRef.current = run;
      const { ac } = run;
      const isCurrent = () => runRef.current === run;

      setState({
        ...initial,
        snapshotItems: [...req.items],
        instructions: new Map(),
        itemErrors: new Map(),
        status: "starting",
        total: req.items.length,
      });

      let silenceTimer: ReturnType<typeof setTimeout> | null = null;
      const armSilence = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          if (run.abortKind == null) run.abortKind = "silence-timeout";
          try {
            ac.abort();
          } catch {
            /* ignore */
          }
        }, SILENCE_TIMEOUT_MS);
      };
      const clearSilence = () => {
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      };

      try {
        const response = await fetch("/api/menu/ordering-instructions/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify(req),
          signal: ac.signal,
        });

        if (!response.ok || !response.body) {
          let detail = `HTTP ${response.status}`;
          try {
            const t = await response.text();
            if (t) detail += `: ${t.slice(0, 200)}`;
          } catch {
            /* ignore */
          }
          throw new Error(detail);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        armSilence();

        let sawTerminal = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          armSilence();
          buffer += decoder.decode(value, { stream: true });

          let sepIdx: number;
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const rawBlock = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            const parsed = parseEventBlock(rawBlock);
            if (!parsed) continue;
            let payload: unknown;
            try {
              payload = JSON.parse(parsed.data);
            } catch {
              continue;
            }
            if (parsed.event === "done" || parsed.event === "error") {
              sawTerminal = true;
            }
            if (isCurrent()) handleEvent(parsed.event, payload);
          }
        }

        clearSilence();

        // Connection closed without a terminal event — treat as dropped.
        if (!sawTerminal && run.abortKind !== "user-cancel" && isCurrent()) {
          setState((s) =>
            s.status === "done" || s.status === "error"
              ? s
              : {
                  ...s,
                  status: "error",
                  error:
                    run.abortKind === "silence-timeout"
                      ? "Translation timed out. Please try again."
                      : "Connection closed before translation finished. Please retry.",
                },
          );
        }
      } catch (err) {
        clearSilence();
        if (run.abortKind === "user-cancel") return;
        if (!isCurrent()) return;
        const message =
          run.abortKind === "silence-timeout"
            ? "Translation timed out. Please try again."
            : err instanceof Error
              ? err.message
              : "Failed to translate";
        setState((s) => ({ ...s, status: "error", error: message }));
      } finally {
        clearSilence();
        if (isCurrent()) runRef.current = null;
      }

      function handleEvent(event: string, payload: unknown) {
        switch (event) {
          case "started": {
            const p = payload as { total?: number };
            setState((s) => ({
              ...s,
              status: "streaming",
              total: typeof p.total === "number" ? p.total : s.total,
            }));
            break;
          }
          case "item": {
            const p = payload as {
              index: number;
              item: string;
              phrase: string;
              pronunciation: string;
            };
            if (typeof p.index !== "number") break;
            setState((s) => {
              const next = new Map(s.instructions);
              next.set(p.index, {
                item: p.item,
                phrase: p.phrase,
                pronunciation: p.pronunciation,
              });
              const errs = new Map(s.itemErrors);
              errs.delete(p.index);
              return {
                ...s,
                status: "streaming",
                instructions: next,
                itemErrors: errs,
              };
            });
            break;
          }
          case "item_error": {
            const p = payload as {
              index: number;
              item: string;
              message: string;
            };
            if (typeof p.index !== "number") break;
            setState((s) => {
              const errs = new Map(s.itemErrors);
              errs.set(p.index, { item: p.item, message: p.message });
              return { ...s, itemErrors: errs };
            });
            break;
          }
          case "full": {
            const p = payload as { fullOrderPhrase: string };
            setState((s) => ({
              ...s,
              fullOrderPhrase: p.fullOrderPhrase ?? "",
            }));
            break;
          }
          case "full_error": {
            const p = payload as { message: string };
            setState((s) => ({
              ...s,
              fullOrderError: p.message ?? "Failed",
            }));
            break;
          }
          case "done": {
            setState((s) => ({ ...s, status: "done" }));
            break;
          }
          case "error": {
            const p = payload as { message?: string };
            setState((s) => ({
              ...s,
              status: "error",
              error: p.message ?? "Stream error",
            }));
            break;
          }
        }
      }
    },
    [cancel],
  );

  return { state, start, cancel, reset };
}
