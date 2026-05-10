import { useState } from "react";
import { useLocation } from "wouter";
import { useProfile } from "@/hooks/use-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const COMMON_RESTRICTIONS = [
  "Gluten-free", "Vegan", "Vegetarian", "Nut allergy", "Peanut allergy", 
  "Dairy-free", "Egg-free", "Shellfish allergy", "Soy-free", "Kosher", 
  "Halal", "Low-sodium", "Diabetic-friendly"
];

export const LANGUAGES = [
  "English", "Spanish", "French", "German", "Italian", "Portuguese", 
  "Japanese", "Korean", "Chinese (Simplified)", "Arabic", "Russian", 
  "Hindi", "Thai", "Vietnamese"
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { setProfile } = useProfile();
  
  const [step, setStep] = useState(1);
  const [nativeLanguage, setNativeLanguage] = useState("English");
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [customRestriction, setCustomRestriction] = useState("");

  const toggleRestriction = (r: string) => {
    setRestrictions(prev => 
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    );
  };

  const addCustomRestriction = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') || !customRestriction.trim()) return;
    e.preventDefault();
    if (!restrictions.includes(customRestriction.trim())) {
      setRestrictions([...restrictions, customRestriction.trim()]);
    }
    setCustomRestriction("");
  };

  const handleComplete = () => {
    setProfile({ nativeLanguage, restrictions });
    setLocation("/camera");
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background p-6">
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full pt-12 pb-24">
        
        {step === 1 && (
          <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Eat safely, anywhere.</h1>
            <p className="text-muted-foreground text-lg mb-10">
              Your pocket companion for navigating foreign menus with dietary restrictions.
            </p>
            
            <div className="space-y-4 mb-8">
              <div className="space-y-2">
                <Label htmlFor="language" className="text-base">What's your native language?</Label>
                <Select value={nativeLanguage} onValueChange={setNativeLanguage}>
                  <SelectTrigger id="language" className="h-12 text-base">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(lang => (
                      <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-auto">
              <Button size="lg" className="w-full h-14 text-lg rounded-xl" onClick={() => setStep(2)}>
                Continue <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold mb-2">What are your dietary needs?</h2>
            <p className="text-muted-foreground mb-8">
              We'll flag menu items that conflict with these restrictions.
            </p>

            <div className="flex-1 overflow-y-auto pb-4 space-y-6">
              <div className="grid grid-cols-1 gap-3">
                {COMMON_RESTRICTIONS.map(r => (
                  <label key={r} className={`flex items-center p-4 border rounded-xl cursor-pointer transition-colors ${restrictions.includes(r) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                    <Checkbox 
                      checked={restrictions.includes(r)} 
                      onCheckedChange={() => toggleRestriction(r)} 
                      className="mr-4 w-5 h-5"
                    />
                    <span className="text-base font-medium">{r}</span>
                  </label>
                ))}
                
                {restrictions.filter(r => !COMMON_RESTRICTIONS.includes(r)).map(r => (
                  <label key={r} className="flex items-center p-4 border rounded-xl border-primary bg-primary/5 cursor-pointer">
                    <Checkbox checked={true} onCheckedChange={() => toggleRestriction(r)} className="mr-4 w-5 h-5" />
                    <span className="text-base font-medium">{r}</span>
                  </label>
                ))}
              </div>

              <div className="pt-4 border-t">
                <Label className="text-sm font-medium mb-2 block">Other restriction?</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="e.g. Garlic allergy" 
                    value={customRestriction}
                    onChange={(e) => setCustomRestriction(e.target.value)}
                    onKeyDown={addCustomRestriction}
                    className="h-12"
                  />
                  <Button type="button" variant="secondary" className="h-12 px-6" onClick={addCustomRestriction}>
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 bg-background">
              <Button size="lg" className="w-full h-14 text-lg rounded-xl" onClick={handleComplete}>
                Start Scanning
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
