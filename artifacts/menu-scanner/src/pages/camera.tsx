import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useProfile, useCart, type MenuItem } from "@/context/store-context";
import { useAnalyzeMenuStream, type AnalyzedMenuItem } from "@/hooks/use-analyze-menu-stream";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Camera, Image as ImageIcon, Loader2, AlertTriangle,
  ShieldCheck, XCircle, Plus, Check, RefreshCw, X,
  ShoppingBag, Settings as SettingsIcon, ArrowLeftRight, ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LANGUAGES } from "@/lib/constants";
import { CitationChainList } from "@/components/citation-chain";
import { RiskScoreBadge, OutcomeButtons, useRiskScore } from "@/components/risk-score";
import { CrossContamBadge, ReviewNoteInput } from "@/components/cross-contamination";
import { scoreCrossContamination, type CrossContamItem } from "@/lib/cross-contam-api";

const MENU_LANGUAGES = [
  "Auto-detect",
  "Japanese", "Chinese (Simplified)", "Chinese (Traditional)", "Korean",
  "Thai", "Vietnamese", "Indonesian", "Malay",
  "French", "Italian", "Spanish", "Portuguese", "German",
  "Arabic", "Hindi", "Russian", "Greek", "Turkish",
  "English",
];

type AnyItem = AnalyzedMenuItem;
type BBox = NonNullable<AnyItem["boundingBox"]>;

async function downscaleDataUrl(dataUrl: string, maxEdge: number, quality: number): Promise<string> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = dataUrl;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return dataUrl;
    const longest = Math.max(w, h);
    if (longest <= maxEdge) return dataUrl;
    const scale = maxEdge / longest;
    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, tw, th);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

function pillColors(level: string) {
  switch (level) {
    case "safe":    return "bg-green-600/90 text-white border-green-400/60";
    case "warning": return "bg-amber-500/90 text-white border-amber-300/60";
    case "danger":  return "bg-red-600/90   text-white border-red-400/60";
    default:        return "bg-gray-700/90  text-white border-gray-400/60";
  }
}

function RiskScoreInline({ item, cuisine }: { item: AnyItem; cuisine: string }) {
  const dish = useMemo(
    () => ({
      name: item.name,
      translatedName: item.translatedName,
      description: item.description,
      cuisine,
      ingredients: [] as string[],
      allergenFlags: item.allergenFlags,
      conflictingRestrictions: item.conflictingRestrictions,
      citations: (item.citations ?? []).map((c) => ({
        allergen: c.allergen ? { slug: c.allergen.slug } : undefined,
      })),
    }),
    [item.name, item.translatedName, item.description, cuisine, item.allergenFlags, item.conflictingRestrictions, item.citations],
  );
  const { data, loading } = useRiskScore(dish);
  return <RiskScoreBadge result={data} loading={loading} />;
}

function SafetyIcon({ level, className }: { level: string; className?: string }) {
  if (level === "safe")    return <ShieldCheck  className={className} />;
  if (level === "warning") return <AlertTriangle className={className} />;
  if (level === "danger")  return <XCircle      className={className} />;
  return null;
}

function cropStyle(bbox: BBox, imageDataUrl: string) {
  const w = Math.max(1, bbox.xmax - bbox.xmin);
  const h = Math.max(1, bbox.ymax - bbox.ymin);
  const restW = 1000 - w;
  const restH = 1000 - h;
  return {
    backgroundImage: `url(${imageDataUrl})`,
    backgroundSize: `${(1000 / w) * 100}% ${(1000 / h) * 100}%`,
    backgroundPosition: `${restW > 0 ? (bbox.xmin / restW) * 100 : 0}% ${restH > 0 ? (bbox.ymin / restH) * 100 : 0}%`,
    backgroundRepeat: "no-repeat" as const,
  };
}

export default function CameraPage() {
  const { profile, setProfile } = useProfile();
  const { addToCart, cartItems } = useCart();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [menuLanguage, setMenuLanguage] = useState("Auto-detect");
  const [targetLanguage, setTargetLanguage] = useState(profile?.nativeLanguage || "English");
  const [cameraMode, setCameraMode] = useState<"idle" | "live">("idle");
  const [cameraError, setCameraError] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [selectedItem, setSelectedItem] = useState<AnyItem | null>(null);
  const lastRequestRef = useRef<{ dataUrl: string } | null>(null);
  // User-driven overrides from the review-note re-score. Stream-emitted
  // cross-contam from the menu/analyze SSE event is the baseline; the
  // re-score adds extracted facts on top and overlays per-dish.
  // (`crossContam` itself is computed below, after `analyze.state` is destructured.)
  const [crossContamOverride, setCrossContamOverride] = useState<Map<string, CrossContamItem>>(new Map());
  const [reviewBusy, setReviewBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const analyze = useAnalyzeMenuStream();

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopStream();
    setCameraError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraMode("live");
    } catch {
      setCameraError(true);
    }
  }, [facingMode, stopStream]);

  // Auto-start camera whenever we're in the idle scanning state with no preview.
  useEffect(() => {
    if (cameraMode === "idle" && !imagePreview && !cameraError) {
      void startCamera();
    }
    return () => {
      // stopStream handled by reset/capture; intentionally not stopping here
      // to avoid tearing down the stream during normal re-renders.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraMode, imagePreview]);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const handleTargetLanguageChange = useCallback((lang: string) => {
    setTargetLanguage(lang);
    if (profile) setProfile({ ...profile, nativeLanguage: lang });
  }, [profile, setProfile]);

  const flipCamera = useCallback(async () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      toast({ title: "Could not flip camera", variant: "destructive" });
    }
  }, [facingMode, stopStream, toast]);

  const runAnalysis = useCallback(async (dataUrl: string) => {
    setImagePreview(dataUrl);
    setSelectedItem(null);
    // Each new scan starts with a fresh override map; the stream's baseline
    // cross-contam events repopulate it from scratch.
    setCrossContamOverride(new Map());
    lastRequestRef.current = { dataUrl };

    // Downscale large photos before upload — full-res phone photos can be
    // 4–8MB base64 which dominates total scan time. 1600px is plenty for
    // Gemini OCR while shrinking the payload by 5–10x.
    const sendUrl = await downscaleDataUrl(dataUrl, 1024, 0.78);
    const base64Data = sendUrl.split(",")[1];
    const detectedMime = sendUrl.split(";")[0].split(":")[1] || "image/jpeg";
    const lang = menuLanguage === "Auto-detect" ? "Unknown" : menuLanguage;
    analyze.start({
      imageBase64: base64Data,
      mimeType: detectedMime,
      menuLanguage: lang,
      restrictions: profile?.restrictions || [],
    });
  }, [analyze, menuLanguage, profile?.restrictions]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopStream();
    setCameraMode("idle");
    runAnalysis(dataUrl);
  }, [stopStream, runAnalysis]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Images only", description: "Please upload a photo of the menu, not a video.", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => runAnalysis(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setImagePreview(null);
    setSelectedItem(null);
    analyze.reset();
    // Clear per-scan review-note overrides so cross-contam results from
    // a previous menu can never bleed into the next scan.
    setCrossContamOverride(new Map());
    lastRequestRef.current = null;
    stopStream();
    setCameraMode("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const retry = () => {
    if (lastRequestRef.current) {
      runAnalysis(lastRequestRef.current.dataUrl);
    }
  };

  const userRestrictions = new Set((profile?.restrictions || []).map(r => r.toLowerCase()));
  const isMatched = (name: string) => {
    const n = name.toLowerCase();
    for (const r of userRestrictions) {
      if (n.includes(r) || r.includes(n)) return true;
    }
    return false;
  };

  const {
    layout, items: itemsMap, itemErrors, status,
    completed, failed, total, error, detectedLanguage,
    crossContam: streamCrossContam,
  } = analyze.state;

  const crossContam = useMemo(() => {
    const merged = new Map<string, CrossContamItem>();
    for (const [k, v] of streamCrossContam) merged.set(k, v);
    for (const [k, v] of crossContamOverride) merged.set(k, v);
    return merged;
  }, [streamCrossContam, crossContamOverride]);

  // Merge layout placeholders with analyzed item data so the UI shows shimmering
  // pins immediately and fills them in as item events arrive. The single-pass
  // server emits an empty layout up front and then streams full items, so we
  // also include item ids that have no matching placeholder.
  const mergedItems = useMemo(() => {
    const ids = new Set<number>();
    for (const p of layout) ids.add(p.id);
    for (const id of itemsMap.keys()) ids.add(id);
    for (const id of itemErrors.keys()) ids.add(id);
    const placeholderById = new Map(layout.map(p => [p.id, p] as const));
    return Array.from(ids)
      .sort((a, b) => a - b)
      .map((id) => {
        const placeholder = placeholderById.get(id);
        const analyzed = itemsMap.get(id) ?? null;
        const failure = itemErrors.get(id) ?? null;
        return {
          id,
          boundingBox: placeholder?.boundingBox ?? analyzed?.boundingBox,
          nameBox: placeholder?.nameBox ?? analyzed?.nameBox,
          analyzed,
          failure,
          originalName: placeholder?.name ?? analyzed?.name ?? "",
        };
      });
  }, [layout, itemsMap, itemErrors]);

  const overlayItems = mergedItems.filter(i => i.boundingBox);
  const noBoxItems = mergedItems.filter(i => !i.boundingBox);
  const isAddedFn = (item: AnyItem) => cartItems.some(c => c.name === item.name);

  const handleAdd = (item: AnyItem) => {
    addToCart(item as MenuItem, detectedLanguage);
    toast({ title: "Added to order", description: `${item.translatedName} added.` });
  };

  const allergensList = profile?.restrictions ?? [];
  const completedItems = useMemo(
    () =>
      mergedItems
        .map((m) => m.analyzed)
        .filter((a): a is AnyItem => !!a),
    [mergedItems],
  );
  const completedKey = completedItems.map((d) => d.name).join("|");

  const runCrossContam = useCallback(
    async (reviewText?: string | null) => {
      if (completedItems.length === 0 || allergensList.length === 0) return;
      const resp = await scoreCrossContamination({
        dishes: completedItems.map((d) => ({
          name: d.name,
          translatedName: d.translatedName,
          description: d.description,
        })),
        allergens: allergensList,
        cuisine: detectedLanguage || (menuLanguage === "Auto-detect" ? null : menuLanguage),
        reviewText: reviewText ?? null,
      });
      if (!resp) return;
      setCrossContamOverride((prev) => {
        const next = new Map(prev);
        for (const it of resp.items) next.set(it.name, it);
        return next;
      });
    },
    [completedItems, allergensList, detectedLanguage, menuLanguage],
  );

  // Note: baseline cross-contamination scoring now ships inline on the
  // /menu/analyze SSE stream (see use-analyze-menu-stream.ts). We only call
  // /cross-contamination/score when the user adds a review note, which
  // extracts facts via Gemini and re-scores with them.

  const handleReview = async (text: string) => {
    setReviewBusy(true);
    try {
      await runCrossContam(text);
      toast({ title: "Re-scored with your note", description: "Cross-contact risks updated." });
    } finally {
      setReviewBusy(false);
    }
  };

  const isWorking = status === "starting" || status === "layout" || status === "analyzing";
  const showInitialOverlay =
    status === "starting" ||
    ((status === "layout" || status === "analyzing") && mergedItems.length === 0);

  const showCameraSurface = !imagePreview;
  const restrictionCount = profile?.restrictions.length || 0;

  return (
    <div className="min-h-[100dvh] bg-black flex flex-col max-w-md mx-auto w-full relative overflow-hidden">
      {/* ── Live camera surface (full-bleed when no preview) ── */}
      {showCameraSurface && (
        <div className="absolute inset-0 z-0 bg-black">
          {cameraMode === "live" && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          )}
          {cameraMode !== "live" && !cameraError && (
            <div className="w-full h-full flex items-center justify-center text-white/60">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}
          {cameraError && (
            <div className="w-full h-full flex flex-col items-center justify-center text-white/80 text-center px-8 gap-4">
              <Camera className="w-12 h-12 opacity-60" />
              <p className="text-sm">Camera permission needed.<br/>Tap to enable, or upload a photo from your gallery.</p>
              <Button onClick={startCamera} variant="secondary" className="rounded-full">Enable camera</Button>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />

          {/* Subtle vignette to make top/bottom bars readable */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/50 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
      )}

      {/* ── Top bar: language translation pill ── */}
      {showCameraSurface && (
        <div className="relative z-10 px-4 pt-4 pb-2 flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
            data-testid="input-file-upload"
          />

          <div
            className="flex-1 mx-auto flex items-center justify-between gap-1 rounded-full bg-white/95 backdrop-blur-md border-2 border-primary/70 shadow-lg pl-2 pr-2 h-11"
            data-testid="language-pill"
          >
            <Select value={menuLanguage} onValueChange={setMenuLanguage}>
              <SelectTrigger
                className="h-9 border-0 shadow-none bg-transparent px-2 text-sm font-semibold text-foreground focus:ring-0 focus:ring-offset-0 [&>svg]:text-primary [&>svg]:opacity-100"
                data-testid="select-menu-language"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MENU_LANGUAGES.map((lang) => (
                  <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ArrowLeftRight className="w-4 h-4 text-primary shrink-0" aria-hidden />

            <Select value={targetLanguage} onValueChange={handleTargetLanguageChange}>
              <SelectTrigger
                className="h-9 border-0 shadow-none bg-transparent px-2 text-sm font-semibold text-foreground focus:ring-0 focus:ring-offset-0 [&>svg]:text-primary [&>svg]:opacity-100"
                data-testid="select-target-language"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>
      )}

      {/* ── Spacer pushing bottom bar / preview content into view ── */}
      {showCameraSurface && <div className="flex-1 relative z-0" />}

      {/* ── Results: image + overlay (replaces camera surface when imagePreview is set) ── */}
      {imagePreview && (
        <div className="relative z-0 flex-1 bg-background overflow-y-auto pb-24">

          {/* Floating circular back button */}
          <button
            type="button"
            onClick={reset}
            className="fixed top-4 left-4 z-30 w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center active:scale-95 transition-all"
            data-testid="button-back-to-camera"
            aria-label="Back to camera"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" strokeWidth={2.5} />
          </button>

          <div className="flex flex-col gap-4">

            {/* ── Annotated photo ── */}
            <div className="relative w-full overflow-hidden bg-black">
              <img
                src={imagePreview}
                alt="Menu"
                className="w-full h-auto block"
                style={{ display: "block" }}
              />

              {/* Initial scanning overlay (only while we have no layout yet) */}
              {showInitialOverlay && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10 gap-3">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                  <p className="text-white text-sm font-medium text-center px-4">
                    Reading menu…
                  </p>
                  <p className="text-white/70 text-xs text-center px-6 max-w-[16rem]">
                    Long menus can take up to a minute.
                  </p>
                </div>
              )}

              {/* Item pins — clean white labels; risky items show a red triangle */}
              {overlayItems.map((entry, idx) => {
                const bbox = entry.boundingBox!;
                const pinBox = entry.nameBox ?? bbox;
                const cx = ((pinBox.xmin + pinBox.xmax) / 2) / 10;
                const cy = ((pinBox.ymin + pinBox.ymax) / 2) / 10;
                const analyzed = entry.analyzed;
                const failure = entry.failure;
                const isSelected = analyzed && selectedItem?.name === analyzed.name;
                const level = analyzed?.safetyLevel ?? (failure ? "failed" : "pending");
                const label = analyzed?.translatedName
                  ?? (failure ? entry.originalName : entry.originalName);
                const isRisky = level === "danger" || level === "warning";

                const baseClass = !analyzed && !failure
                  ? "bg-white/90 text-foreground/60 border-white/70"
                  : failure
                  ? "bg-white/90 text-foreground/60 border-white/70"
                  : isSelected
                  ? "bg-white text-foreground border-2 border-primary"
                  : "bg-white text-foreground border border-white";

                return (
                  <button
                    key={entry.id}
                    onClick={() => analyzed && setSelectedItem(isSelected ? null : analyzed)}
                    disabled={!analyzed}
                    title={failure?.message}
                    style={{ left: `${cx}%`, top: `${cy}%`, transform: "translate(-50%, -50%)" }}
                    className={`
                      absolute z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold
                      shadow-md whitespace-nowrap transition-all max-w-[50%]
                      ${baseClass}
                      ${analyzed ? "active:scale-95" : failure ? "cursor-default" : "animate-pulse cursor-default"}
                    `}
                    data-testid={
                      analyzed ? `pin-menu-item-${idx}` :
                      failure ? `pin-error-${idx}` : `pin-placeholder-${idx}`
                    }
                  >
                    {!analyzed && !failure && (
                      <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                    )}
                    {analyzed && isRisky && (
                      <AlertTriangle
                        className={`w-3.5 h-3.5 shrink-0 ${level === "danger" ? "text-red-500" : "text-amber-500"}`}
                        strokeWidth={2.5}
                      />
                    )}
                    {failure && !analyzed && (
                      <AlertTriangle className="w-3 h-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Progress / status row */}
            {(isWorking || status === "done") && total > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span data-testid="text-progress">
                  {status === "done"
                    ? `Done — ${completed} of ${total} analyzed${failed > 0 ? `, ${failed} failed` : ""}`
                    : `${completed} of ${total} item${total === 1 ? "" : "s"} analyzed${failed > 0 ? ` (${failed} failed)` : ""}`}
                </span>
                {isWorking && completed + failed < total && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
              </div>
            )}

            {status === "error" && (
              <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm flex flex-col gap-2">
                <span>{error || "Could not analyze the menu."}</span>
                <Button size="sm" variant="outline" onClick={retry} className="self-start">
                  <RefreshCw className="w-3 h-3 mr-1" /> Retry
                </Button>
              </div>
            )}

            {status === "done" && mergedItems.length === 0 && (
              <div className="p-4 rounded-xl bg-muted text-muted-foreground text-sm text-center">
                No menu items were detected. Try a clearer photo.
              </div>
            )}

            {/* Items without bounding box (fallback list) */}
            {noBoxItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Additional items
                </p>
                {noBoxItems.map((entry, idx) => {
                  const analyzed = entry.analyzed;
                  const failure = entry.failure;
                  if (!analyzed && failure) {
                    return (
                      <div
                        key={entry.id}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40"
                        data-testid={`list-item-error-${idx}`}
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{entry.originalName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Couldn't analyze — {failure.message}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  if (!analyzed) {
                    return (
                      <div
                        key={entry.id}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card animate-pulse"
                      >
                        <Loader2 className="w-4 h-4 shrink-0 animate-spin text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{entry.originalName}</p>
                        </div>
                      </div>
                    );
                  }
                  const cc = crossContam.get(analyzed.name) ?? null;
                  return (
                    <div key={entry.id} className="space-y-1.5">
                      <button
                        onClick={() => setSelectedItem(analyzed)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all active:scale-[0.98] ${
                          analyzed.safetyLevel === "danger"
                            ? "border-red-500/40 bg-red-500/5"
                            : analyzed.safetyLevel === "warning"
                            ? "border-amber-500/40 bg-amber-500/5"
                            : "border-border bg-card"
                        }`}
                        data-testid={`list-menu-item-${idx}`}
                      >
                        <SafetyIcon level={analyzed.safetyLevel} className={`w-4 h-4 shrink-0 ${
                          analyzed.safetyLevel === "danger" ? "text-red-500" :
                          analyzed.safetyLevel === "warning" ? "text-amber-500" : "text-green-600"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{analyzed.translatedName}</p>
                          <p className="text-xs text-muted-foreground truncate">{analyzed.name}</p>
                        </div>
                      </button>
                      {cc && <CrossContamBadge result={cc} compact />}
                    </div>
                  );
                })}
              </div>
            )}

            {status === "done" && allergensList.length > 0 && completedItems.length > 0 && (
              <div className="px-4">
                <ReviewNoteInput onSubmit={handleReview} busy={reviewBusy} />
              </div>
            )}
          </div>

          {/* Floating "Go To Cart" pill */}
          <button
            type="button"
            onClick={() => setLocation("/cart")}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 h-12 px-6 rounded-full bg-primary text-white shadow-2xl active:scale-95 transition-all flex items-center gap-2 font-semibold"
            data-testid="button-go-to-cart"
          >
            <ShoppingBag className="w-5 h-5" strokeWidth={2.25} />
            <span>Go To Cart</span>
            {cartItems.length > 0 && (
              <span className="ml-1 bg-white text-primary text-xs font-bold h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center">
                {cartItems.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── Bottom shutter bar (idle/live mode only) ── */}
      {showCameraSurface && (
        <div className="relative z-10 mt-auto">
          <div className="bg-primary/95 backdrop-blur-md shadow-[0_-8px_24px_rgba(0,0,0,0.25)] px-6 flex items-end justify-between pl-[72px] pr-[72px] pt-[12px] pb-[24px]">
            <button
              type="button"
              onClick={() => setLocation("/cart")}
              className="relative w-14 h-14 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 transition-all flex items-center justify-center text-white"
              aria-label="Past order"
              data-testid="button-past-order"
            >
              <ShoppingBag className="w-6 h-6" strokeWidth={2.25} />
              {cartItems.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-white text-primary text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center shadow-md">
                  {cartItems.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={cameraMode === "live" ? capturePhoto : () => fileInputRef.current?.click()}
              disabled={cameraMode !== "live" && cameraError === false}
              className="w-20 h-20 -mt-6 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center active:scale-95 transition-all disabled:opacity-50 ring-4 ring-white/40 shadow-2xl"
              aria-label={cameraMode === "live" ? "Snap picture" : "Upload from gallery"}
              data-testid="button-shutter"
            >
              <div className="w-16 h-16 rounded-full bg-white" />
            </button>

            <button
              type="button"
              onClick={() => setLocation("/settings")}
              className="w-14 h-14 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 transition-all flex items-center justify-center text-white"
              aria-label="Settings"
              data-testid="button-settings"
            >
              <SettingsIcon className="w-6 h-6" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom sheet detail panel ── */}
      {selectedItem && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/40"
            onClick={() => setSelectedItem(null)}
          />

          <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-md z-40 rounded-t-3xl bg-background shadow-2xl border-t animate-in slide-in-from-bottom-8 duration-300 flex flex-col max-h-[75dvh]">

            {selectedItem.boundingBox && imagePreview && (
              <div
                className="w-full h-36 rounded-t-3xl shrink-0"
                style={cropStyle(selectedItem.boundingBox, imagePreview)}
                aria-hidden="true"
              />
            )}

            <div className="overflow-y-auto overscroll-contain">
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-bold text-2xl leading-tight">{selectedItem.translatedName}</h2>
                    {(selectedItem.safetyLevel === "danger" || selectedItem.safetyLevel === "warning") && (
                      <AlertTriangle
                        className={`w-6 h-6 shrink-0 ${selectedItem.safetyLevel === "danger" ? "text-red-500" : "text-amber-500"}`}
                        strokeWidth={2.5}
                      />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">{selectedItem.name}</p>
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-1.5 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 shrink-0 mt-0.5"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Allergens block — leads the sheet, soft red surface */}
              {(selectedItem.conflictingRestrictions.length > 0 || selectedItem.allergenFlags.length > 0) && (
                <div className="bg-red-500/10 border border-red-500/15 p-4 rounded-2xl space-y-2">
                  <p className="text-base font-bold text-foreground">Allergens</p>
                  {selectedItem.conflictingRestrictions.length > 0 && (
                    <p className="text-sm text-foreground/90 leading-relaxed">
                      {selectedItem.conflictingRestrictions.join(", ")}
                    </p>
                  )}
                  {selectedItem.allergenFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selectedItem.allergenFlags.map((flag, i) => {
                        const matched = isMatched(flag.name);
                        return (
                          <span key={i} className={`text-xs px-2 py-1 rounded-full font-medium border ${
                            matched
                              ? "bg-red-500/15 text-red-700 border-red-400/40"
                              : "bg-white/70 text-foreground/80 border-border"
                          }`}>
                            {matched ? "⚠ " : ""}{flag.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              <div className="space-y-2">
                <p className="text-base font-bold text-foreground">Description</p>
                <p className="text-sm text-foreground/80 leading-relaxed">{selectedItem.description}</p>
              </div>

              <RiskScoreInline item={selectedItem} cuisine={detectedLanguage} />

              <CrossContamBadge result={crossContam.get(selectedItem.name) ?? null} />

              {selectedItem.citations && selectedItem.citations.length > 0 && (
                <CitationChainList chains={selectedItem.citations} />
              )}

              <Button
                variant={selectedItem.safetyLevel === "danger" ? "destructive" : "default"}
                className="w-full h-12 rounded-2xl text-base"
                disabled={isAddedFn(selectedItem)}
                onClick={() => handleAdd(selectedItem)}
                data-testid="button-add-selected"
              >
                {isAddedFn(selectedItem) ? (
                  <><Check className="w-4 h-4 mr-2" /> Added to Order</>
                ) : (
                  <><Plus className="w-4 h-4 mr-2" /> Add to Order</>
                )}
              </Button>

              <OutcomeButtons
                dish={{
                  name: selectedItem.name,
                  translatedName: selectedItem.translatedName,
                  description: selectedItem.description,
                  ingredients: [],
                  allergenFlags: selectedItem.allergenFlags,
                  conflictingRestrictions: selectedItem.conflictingRestrictions,
                  citations: (selectedItem.citations ?? []).map((c) => ({
                    allergen: c.allergen ? { slug: c.allergen.slug } : undefined,
                  })),
                }}
                cuisine={detectedLanguage}
              />
            </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
