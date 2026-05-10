import { useState, useRef, useCallback, useMemo } from "react";
import { useProfile, useCart, type MenuItem } from "@/context/store-context";
import { useAnalyzeMenuStream, type AnalyzedMenuItem } from "@/hooks/use-analyze-menu-stream";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Camera, Image as ImageIcon, Loader2, AlertTriangle,
  ShieldCheck, XCircle, Plus, Check, RefreshCw, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CitationChainList } from "@/components/citation-chain";
import { RiskScoreBadge, OutcomeButtons, useRiskScore } from "@/components/risk-score";

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
  const { profile } = useProfile();
  const { addToCart, cartItems } = useCart();
  const { toast } = useToast();

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [menuLanguage, setMenuLanguage] = useState("Auto-detect");
  const [cameraMode, setCameraMode] = useState<"idle" | "live">("idle");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [selectedItem, setSelectedItem] = useState<AnyItem | null>(null);
  const lastRequestRef = useRef<{ dataUrl: string } | null>(null);

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
      toast({ title: "Camera unavailable", description: "Upload a photo instead.", variant: "destructive" });
    }
  }, [facingMode, stopStream, toast]);

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
  } = analyze.state;

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

  const isWorking = status === "starting" || status === "layout" || status === "analyzing";
  const showInitialOverlay =
    status === "starting" ||
    ((status === "layout" || status === "analyzing") && mergedItems.length === 0);

  return (
    <div className="min-h-[100dvh] pb-20 bg-background flex flex-col max-w-md mx-auto w-full">
      <header className="p-4 border-b bg-card sticky top-0 z-10">
        <h1 className="text-xl font-bold">Scan Menu</h1>
        <p className="text-sm text-muted-foreground">
          Checking for {profile?.restrictions.length || 0} restriction{profile?.restrictions.length !== 1 ? "s" : ""}
        </p>
      </header>

      <div className="flex-1 p-4 flex flex-col gap-4">
        {/* Language selector */}
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium shrink-0">Menu language</Label>
          <Select value={menuLanguage} onValueChange={setMenuLanguage}>
            <SelectTrigger className="h-9 text-sm flex-1" data-testid="select-menu-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MENU_LANGUAGES.map(lang => (
                <SelectItem key={lang} value={lang}>{lang}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Live camera */}
        {cameraMode === "live" && !imagePreview && (
          <div className="flex flex-col gap-3">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <Button
                variant="ghost" size="icon"
                className="absolute top-2 right-2 bg-black/40 text-white hover:bg-black/60 rounded-full"
                onClick={flipCamera}
                data-testid="button-flip-camera"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={reset}>Cancel</Button>
              <Button className="flex-1 h-12 rounded-xl" onClick={capturePhoto} data-testid="button-capture">
                <Camera className="w-4 h-4 mr-2" /> Capture
              </Button>
            </div>
          </div>
        )}

        {/* Idle state */}
        {cameraMode === "idle" && !imagePreview && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-6">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
              <Camera className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Ready to scan?</h2>
              <p className="text-muted-foreground">Take a photo of the menu to translate it and check for allergens.</p>
            </div>
            <input type="file" accept="image/*" className="hidden" ref={fileInputRef}
              onChange={handleFileUpload} data-testid="input-file-upload" />
            <div className="w-full space-y-3">
              <Button size="lg" className="w-full h-14 text-lg rounded-xl" onClick={startCamera} data-testid="button-open-camera">
                <Camera className="mr-2 w-5 h-5" /> Use Camera
              </Button>
              <Button variant="outline" size="lg" className="w-full h-14 text-lg rounded-xl"
                onClick={() => fileInputRef.current?.click()} data-testid="button-upload-gallery">
                <ImageIcon className="mr-2 w-5 h-5" /> Upload from Gallery
              </Button>
            </div>
          </div>
        )}

        {/* Results: image + overlay */}
        {imagePreview && (
          <div className="flex flex-col gap-4 pb-8">

            {/* ── Annotated photo ── */}
            <div className="relative w-full rounded-2xl overflow-hidden border shadow-sm bg-black">
              <img
                src={imagePreview}
                alt="Menu"
                className="w-full h-auto block"
                style={{ display: "block" }}
              />

              {/* Retake button */}
              <Button
                variant="secondary" size="sm"
                className="absolute top-2 right-2 rounded-full h-8 z-20"
                onClick={reset}
                data-testid="button-retake"
              >
                Retake
              </Button>

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

              {/* Item pins (placeholders shimmer until analyzed; failed items
                  show a muted "couldn't analyze" pin without blocking others) */}
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
                  ?? (failure ? `${entry.originalName} — failed` : entry.originalName);
                const colorClass = failure && !analyzed
                  ? "bg-gray-500/90 text-white border-gray-300/60"
                  : pillColors(level);

                return (
                  <button
                    key={entry.id}
                    onClick={() => analyzed && setSelectedItem(isSelected ? null : analyzed)}
                    disabled={!analyzed}
                    title={failure?.message}
                    style={{ left: `${cx}%`, top: `${cy}%`, transform: "translate(-50%, -50%)" }}
                    className={`
                      absolute z-10 flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-semibold
                      shadow-lg backdrop-blur-sm whitespace-nowrap transition-all max-w-[44%]
                      ${colorClass}
                      ${analyzed ? "active:scale-95" : failure ? "cursor-default" : "animate-pulse cursor-default"}
                      ${isSelected ? "ring-2 ring-white scale-105" : ""}
                    `}
                    data-testid={
                      analyzed ? `pin-menu-item-${idx}` :
                      failure ? `pin-error-${idx}` : `pin-placeholder-${idx}`
                    }
                  >
                    {analyzed ? (
                      <SafetyIcon level={level} className="w-3 h-3 shrink-0" />
                    ) : failure ? (
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                    ) : (
                      <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
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
                  return (
                    <button
                      key={entry.id}
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
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

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
                    <SafetyIcon level={selectedItem.safetyLevel} className={`w-5 h-5 shrink-0 ${
                      selectedItem.safetyLevel === "danger" ? "text-red-500" :
                      selectedItem.safetyLevel === "warning" ? "text-amber-500" : "text-green-600"
                    }`} />
                    <h2 className="font-bold text-xl leading-tight">{selectedItem.translatedName}</h2>
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

              <p className="text-sm text-foreground/80 leading-relaxed">{selectedItem.description}</p>

              <RiskScoreInline item={selectedItem} cuisine={detectedLanguage} />

              {selectedItem.citations && selectedItem.citations.length > 0 && (
                <CitationChainList chains={selectedItem.citations} />
              )}

              {(selectedItem.conflictingRestrictions.length > 0 || selectedItem.allergenFlags.length > 0) && (
                <div className="space-y-3 bg-muted/50 p-3 rounded-2xl">
                  {selectedItem.conflictingRestrictions.length > 0 && (
                    <div className="flex items-start gap-2 text-sm text-red-600 font-semibold">
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>Contains: {selectedItem.conflictingRestrictions.join(", ")}</span>
                    </div>
                  )}
                  {selectedItem.allergenFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedItem.allergenFlags.map((flag, i) => {
                        const matched = isMatched(flag.name);
                        return (
                          <span key={i} className={`text-xs px-2 py-1 rounded-full font-medium border ${
                            matched
                              ? "bg-red-500/10 text-red-600 border-red-400/30"
                              : "bg-amber-500/10 text-amber-700 border-amber-400/20"
                          }`}>
                            {matched ? "⚠ " : ""}{flag.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
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
