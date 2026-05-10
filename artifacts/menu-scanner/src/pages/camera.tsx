import { useState, useRef, useCallback } from "react";
import { useProfile, useCart, type MenuItem } from "@/context/store-context";
import { useAnalyzeMenu } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Image as ImageIcon, Loader2, AlertTriangle, ShieldCheck, XCircle, Plus, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MENU_LANGUAGES = [
  "Auto-detect",
  "Japanese", "Chinese (Simplified)", "Chinese (Traditional)", "Korean",
  "Thai", "Vietnamese", "Indonesian", "Malay",
  "French", "Italian", "Spanish", "Portuguese", "German",
  "Arabic", "Hindi", "Russian", "Greek", "Turkish",
  "English",
];

export default function CameraPage() {
  const { profile } = useProfile();
  const { addToCart, cartItems } = useCart();
  const { toast } = useToast();

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [menuLanguage, setMenuLanguage] = useState("Auto-detect");
  const [cameraMode, setCameraMode] = useState<"idle" | "live">("idle");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const analyzeMenu = useAnalyzeMenu();

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      toast({ title: "Could not flip camera", variant: "destructive" });
    }
  }, [facingMode, stopStream, toast]);

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
  }, [stopStream]);

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

  const runAnalysis = (dataUrl: string) => {
    setImagePreview(dataUrl);
    const base64Data = dataUrl.split(",")[1];
    const detectedMime = dataUrl.split(";")[0].split(":")[1] || "image/jpeg";
    const lang = menuLanguage === "Auto-detect" ? "Unknown" : menuLanguage;
    analyzeMenu.mutate({
      data: {
        imageBase64: base64Data,
        mimeType: detectedMime,
        menuLanguage: lang,
        restrictions: profile?.restrictions || [],
      },
    });
  };

  const reset = () => {
    setImagePreview(null);
    analyzeMenu.reset();
    stopStream();
    setCameraMode("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getSafetyColor = (level: string) => {
    switch (level) {
      case "safe": return "text-safe bg-safe/10 border-safe/20";
      case "warning": return "text-warning bg-warning/10 border-warning/20";
      case "danger": return "text-destructive bg-destructive/10 border-destructive/20";
      default: return "text-muted-foreground bg-muted border-muted-foreground/20";
    }
  };

  const getSafetyIcon = (level: string) => {
    switch (level) {
      case "safe": return <ShieldCheck className="w-5 h-5 text-safe" />;
      case "warning": return <AlertTriangle className="w-5 h-5 text-warning" />;
      case "danger": return <XCircle className="w-5 h-5 text-destructive" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-[100dvh] pb-20 bg-background flex flex-col max-w-md mx-auto w-full">
      <header className="p-4 border-b bg-card sticky top-0 z-10">
        <h1 className="text-xl font-bold">Scan Menu</h1>
        <p className="text-sm text-muted-foreground">
          Checking for {profile?.restrictions.length || 0} restriction{profile?.restrictions.length !== 1 ? "s" : ""}
        </p>
      </header>

      <div className="flex-1 p-4 flex flex-col gap-4">
        {/* Language selector always visible */}
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

        {/* Live camera view */}
        {cameraMode === "live" && !imagePreview && (
          <div className="flex flex-col gap-3">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 bg-black/40 text-white hover:bg-black/60 rounded-full"
                onClick={flipCamera}
                data-testid="button-flip-camera"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={reset}>
                Cancel
              </Button>
              <Button className="flex-1 h-12 rounded-xl" onClick={capturePhoto} data-testid="button-capture">
                <Camera className="w-4 h-4 mr-2" /> Capture
              </Button>
            </div>
          </div>
        )}

        {/* Idle / no image yet */}
        {cameraMode === "idle" && !imagePreview && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-6">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
              <Camera className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Ready to scan?</h2>
              <p className="text-muted-foreground">Take a photo of the menu to translate it and check for allergens.</p>
            </div>

            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
              data-testid="input-file-upload"
            />

            <div className="w-full space-y-3">
              <Button
                size="lg"
                className="w-full h-14 text-lg rounded-xl"
                onClick={startCamera}
                data-testid="button-open-camera"
              >
                <Camera className="mr-2 w-5 h-5" /> Use Camera
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full h-14 text-lg rounded-xl"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-gallery"
              >
                <ImageIcon className="mr-2 w-5 h-5" /> Upload from Gallery
              </Button>
            </div>
          </div>
        )}

        {/* Image captured — show preview + results */}
        {imagePreview && (
          <div className="space-y-6">
            <div className="relative rounded-2xl overflow-hidden shadow-sm border bg-black aspect-video">
              <img src={imagePreview} alt="Menu preview" className="w-full h-full object-cover opacity-80" />
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2 rounded-full h-8"
                onClick={reset}
                data-testid="button-retake"
              >
                Retake
              </Button>
            </div>

            {analyzeMenu.isPending && (
              <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-lg font-medium animate-pulse text-center">
                  Reading menu and checking ingredients...
                </p>
              </div>
            )}

            {analyzeMenu.isError && (
              <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm text-center">
                Could not analyze the menu. Please try again.
              </div>
            )}

            {analyzeMenu.data && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">Found {analyzeMenu.data.items.length} items</h3>
                  <span className="text-sm px-2 py-1 bg-muted rounded-md text-muted-foreground font-medium">
                    {analyzeMenu.data.detectedLanguage}
                  </span>
                </div>

                <div className="space-y-4">
                  {analyzeMenu.data.items.map((item, idx) => {
                    const isAdded = cartItems.some(i => i.name === item.name);
                    return (
                      <Card key={idx} className="overflow-hidden border-2 transition-all" data-testid={`card-menu-item-${idx}`}>
                        <CardContent className="p-0">
                          <div className={`p-4 border-b border-dashed ${getSafetyColor(item.safetyLevel)}`}>
                            <div className="flex items-center gap-2 font-semibold text-lg">
                              {getSafetyIcon(item.safetyLevel)}
                              <span>{item.translatedName}</span>
                            </div>
                            <p className="text-sm mt-1 opacity-80 font-medium">{item.name}</p>
                          </div>

                          <div className="p-4 space-y-4">
                            <p className="text-sm text-foreground/80 leading-relaxed">{item.description}</p>

                            {(item.conflictingRestrictions.length > 0 || item.allergenFlags.length > 0) && (
                              <div className="space-y-2 bg-muted/50 p-3 rounded-xl">
                                {item.conflictingRestrictions.length > 0 && (
                                  <div className="text-sm text-destructive font-medium flex items-start gap-1.5">
                                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>Contains: {item.conflictingRestrictions.join(", ")}</span>
                                  </div>
                                )}
                                {item.allergenFlags.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {item.allergenFlags.map((flag, i) => (
                                      <span key={i} className="text-xs px-2 py-1 rounded-md bg-warning/10 text-warning-foreground border border-warning/20 font-medium">
                                        {flag.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            <Button
                              variant={item.safetyLevel === "danger" ? "destructive" : "default"}
                              className="w-full rounded-xl"
                              disabled={isAdded}
                              onClick={() => {
                                addToCart(item as MenuItem, analyzeMenu.data.detectedLanguage);
                                toast({
                                  title: "Added to order",
                                  description: `${item.translatedName} added.`,
                                });
                              }}
                              data-testid={`button-add-item-${idx}`}
                            >
                              {isAdded ? (
                                <><Check className="w-4 h-4 mr-2" /> Added</>
                              ) : (
                                <><Plus className="w-4 h-4 mr-2" /> Add to Order</>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
