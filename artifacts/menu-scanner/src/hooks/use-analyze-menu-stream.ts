import { useCallback, useRef, useState } from "react";
import type { MenuItem, MenuItemBoundingBox } from "@workspace/api-client-react";

export type AnalyzedMenuItem = MenuItem;

export type LayoutPlaceholder = {
  id: number;
  name: string;
  boundingBox?: MenuItemBoundingBox;
  nameBox?: MenuItemBoundingBox;
};

export type AnalyzeMenuRequest = {
  imageBase64: string;
  mimeType: string;
  menuLanguage: string;
  restrictions: string[];
};

export type ItemError = { name: string; message: string };

export type AnalyzeMenuStreamState = {
  status: "idle" | "starting" | "layout" | "analyzing" | "done" | "error";
  layout: LayoutPlaceholder[];
  items: Map<number, AnalyzedMenuItem>;
  itemErrors: Map<number, ItemError>;
  detectedLanguage: string;
  completed: number;
  failed: number;
  total: number;
  error: string | null;
};

const initialState: AnalyzeMenuStreamState = {
  status: "idle",
  layout: [],
  items: new Map(),
  itemErrors: new Map(),
  detectedLanguage: "",
  completed: 0,
  failed: 0,
  total: 0,
  error: null,
};

/**
 * Parse a single SSE message block (one or more `field: value` lines
 * terminated by a blank line) into { event, data }.
 */
function parseEventBlock(block: string): { event: string; data: string } | null {
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

export function useAnalyzeMenuStream() {
  const [state, setState] = useState<AnalyzeMenuStreamState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState(initialState);
  }, [cancel]);

  const start = useCallback(
    async (req: AnalyzeMenuRequest) => {
      cancel();
      const ac = new AbortController();
      abortRef.current = ac;

      setState({
        ...initialState,
        items: new Map(),
        itemErrors: new Map(),
        status: "starting",
      });

      try {
        const response = await fetch("/api/menu/analyze", {
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

        let sawTerminal = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sepIdx: number;
          // SSE messages are separated by a blank line ("\n\n")
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
            handleEvent(parsed.event, payload);
          }
        }

        // Stream closed cleanly without a terminal `done`/`error` event —
        // treat this as a dropped connection so the user can retry.
        if (!sawTerminal && !ac.signal.aborted) {
          setState((s) =>
            s.status === "done" || s.status === "error"
              ? s
              : {
                  ...s,
                  status: "error",
                  error: "Connection closed before analysis finished. Please retry.",
                },
          );
        }
      } catch (err) {
        if (ac.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Failed to analyze menu";
        setState((s) => ({ ...s, status: "error", error: message }));
      }

      function handleEvent(event: string, payload: unknown) {
        switch (event) {
          case "layout": {
            const p = payload as {
              items?: LayoutPlaceholder[];
              detectedLanguage?: string;
            };
            setState((s) => ({
              ...s,
              status: "layout",
              layout: Array.isArray(p.items) ? p.items : [],
              detectedLanguage: p.detectedLanguage ?? "",
              total: Array.isArray(p.items) ? p.items.length : 0,
            }));
            break;
          }
          case "item": {
            const p = payload as { id: number; item: AnalyzedMenuItem };
            if (typeof p.id !== "number" || !p.item) break;
            setState((s) => {
              const next = new Map(s.items);
              next.set(p.id, p.item);
              const errs = new Map(s.itemErrors);
              errs.delete(p.id);
              return { ...s, status: "analyzing", items: next, itemErrors: errs };
            });
            break;
          }
          case "item_error": {
            const p = payload as { id: number; name?: string; message?: string };
            if (typeof p.id !== "number") break;
            setState((s) => {
              const errs = new Map(s.itemErrors);
              errs.set(p.id, {
                name: p.name ?? "",
                message: p.message ?? "Could not analyze",
              });
              return { ...s, status: "analyzing", itemErrors: errs };
            });
            break;
          }
          case "progress": {
            const p = payload as {
              completed?: number;
              failed?: number;
              total?: number;
            };
            setState((s) => ({
              ...s,
              completed: typeof p.completed === "number" ? p.completed : s.completed,
              failed: typeof p.failed === "number" ? p.failed : s.failed,
              total: typeof p.total === "number" ? p.total : s.total,
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
