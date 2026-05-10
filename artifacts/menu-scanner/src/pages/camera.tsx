import { useState, useRef } from "react";
import { useProfile, useCart, MenuItem } from "@/hooks/use-store";
import { useAnalyzeMenu } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Image as ImageIcon, Loader2, AlertTriangle, ShieldCheck, XCircle, Plus, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CameraPage() {
  const { profile } = useProfile();
  const { addToCart, cartItems } = useCart();
  const { toast } = useToast();
  
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const analyzeMenu = useAnalyzeMenu();

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImagePreview(base64);
      
      const base64Data = base64.split(',')[1];
      
      analyzeMenu.mutate({
        data: {
          imageBase64: base64Data,
          menuLanguage: "Unknown", // Let Gemini detect it
          restrictions: profile?.restrictions || []
        }
      });
    };
    reader.readAsDataURL(file);
  };

  const getSafetyColor = (level: string) => {
    switch (level) {
      case 'safe': return 'text-safe bg-safe/10 border-safe/20';
      case 'warning': return 'text-warning bg-warning/10 border-warning/20';
      case 'danger': return 'text-destructive bg-destructive/10 border-destructive/20';
      default: return 'text-muted-foreground bg-muted border-muted-foreground/20';
    }
  };

  const getSafetyIcon = (level: string) => {
    switch (level) {
      case 'safe': return <ShieldCheck className="w-5 h-5 text-safe" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-warning" />;
      case 'danger': return <XCircle className="w-5 h-5 text-destructive" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-[100dvh] pb-20 bg-background flex flex-col max-w-md mx-auto w-full">
      <header className="p-4 border-b bg-card sticky top-0 z-10">
        <h1 className="text-xl font-bold">Scan Menu</h1>
        <p className="text-sm text-muted-foreground">
          Checking for {profile?.restrictions.length || 0} restrictions
        </p>
      </header>

      <div className="flex-1 p-4 flex flex-col gap-4">
        {!imagePreview && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-6">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Camera className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Ready to order?</h2>
              <p className="text-muted-foreground">Take a photo of the menu to instantly translate and check for allergens.</p>
            </div>
            
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleCapture}
            />
            
            <div className="w-full space-y-3">
              <Button size="lg" className="w-full h-14 text-lg rounded-xl" onClick={() => fileInputRef.current?.click()}>
                <Camera className="mr-2 w-5 h-5" /> Take Photo
              </Button>
              <Button variant="outline" size="lg" className="w-full h-14 text-lg rounded-xl" onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute('capture');
                  fileInputRef.current.click();
                  fileInputRef.current.setAttribute('capture', 'environment');
                }
              }}>
                <ImageIcon className="mr-2 w-5 h-5" /> Upload from Gallery
              </Button>
            </div>
          </div>
        )}

        {imagePreview && (
          <div className="space-y-6">
            <div className="relative rounded-2xl overflow-hidden shadow-sm border bg-black aspect-video">
              <img src={imagePreview} alt="Menu preview" className="w-full h-full object-cover opacity-70" />
              <Button 
                variant="secondary" 
                size="sm" 
                className="absolute top-2 right-2 rounded-full h-8"
                onClick={() => {
                  setImagePreview(null);
                  analyzeMenu.reset();
                }}
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

            {analyzeMenu.data && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">Found {analyzeMenu.data.items.length} items</h3>
                  <span className="text-sm px-2 py-1 bg-muted rounded-md text-muted-foreground font-medium">
                    Detected: {analyzeMenu.data.detectedLanguage}
                  </span>
                </div>

                <div className="space-y-4">
                  {analyzeMenu.data.items.map((item, idx) => {
                    const isAdded = cartItems.some(i => i.name === item.name);
                    return (
                      <Card key={idx} className="overflow-hidden border-2 transition-all">
                        <CardContent className="p-0">
                          <div className={`p-4 border-b border-dashed ${getSafetyColor(item.safetyLevel)} border-x-0 border-t-0 border-b-current/20`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 font-semibold text-lg">
                                {getSafetyIcon(item.safetyLevel)}
                                <span>{item.translatedName}</span>
                              </div>
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
                              variant={item.safetyLevel === 'danger' ? 'destructive' : 'default'}
                              className="w-full rounded-xl"
                              disabled={isAdded}
                              onClick={() => {
                                addToCart(item as MenuItem, analyzeMenu.data.detectedLanguage);
                                toast({
                                  title: "Added to order",
                                  description: `${item.translatedName} added successfully.`,
                                });
                              }}
                            >
                              {isAdded ? (
                                <><Check className="w-4 h-4 mr-2" /> Added to Order</>
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
