import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useProfile } from "@/context/store-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { COMMON_RESTRICTIONS, COMMON_PREFERENCES, LANGUAGES } from "@/lib/constants";
import { Brain, ChevronRight, ArrowLeft } from "lucide-react";

export default function SettingsPage() {
  const { profile, setProfile } = useProfile();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [nativeLanguage, setNativeLanguage] = useState("");
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [customRestriction, setCustomRestriction] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [customPreference, setCustomPreference] = useState("");
  const [preferenceNotes, setPreferenceNotes] = useState("");

  useEffect(() => {
    if (profile) {
      setNativeLanguage(profile.nativeLanguage);
      setRestrictions(profile.restrictions);
      setPreferences(profile.preferences ?? []);
      setPreferenceNotes(profile.preferenceNotes ?? "");
    }
  }, [profile]);

  const toggleRestriction = (r: string) => {
    setRestrictions(prev =>
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    );
  };

  const addCustomRestriction = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') return;
    if (!customRestriction.trim()) return;
    e.preventDefault();
    if (!restrictions.includes(customRestriction.trim())) {
      setRestrictions(prev => [...prev, customRestriction.trim()]);
    }
    setCustomRestriction("");
  };

  const togglePreference = (p: string) => {
    setPreferences(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const addCustomPreference = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') return;
    if (!customPreference.trim()) return;
    e.preventDefault();
    if (!preferences.includes(customPreference.trim())) {
      setPreferences(prev => [...prev, customPreference.trim()]);
    }
    setCustomPreference("");
  };

  const saveSettings = () => {
    setProfile({
      nativeLanguage,
      restrictions,
      preferences,
      preferenceNotes: preferenceNotes.trim(),
    });
    toast({ title: "Settings saved", description: "Your profile has been updated." });
  };

  if (!profile) return null;

  return (
    <div className="min-h-[100dvh] pb-24 bg-background flex flex-col max-w-md mx-auto w-full">
      <header className="px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] border-b bg-card sticky top-0 z-10 flex items-center gap-3">
        <button
          onClick={() => setLocation("/camera")}
          className="p-1.5 rounded-full hover:bg-muted"
          data-testid="button-back-to-camera"
          aria-label="Back to camera"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      <div className="p-6 space-y-8 flex-1 overflow-y-auto">
        <div className="space-y-3">
          <Label className="text-base font-bold">Native Language</Label>
          <Select value={nativeLanguage} onValueChange={setNativeLanguage}>
            <SelectTrigger className="h-12 text-base rounded-xl" data-testid="select-settings-language">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(lang => (
                <SelectItem key={lang} value={lang}>{lang}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4">
          <Label className="text-base font-bold">Dietary Restrictions</Label>
          <div className="grid grid-cols-1 gap-3">
            {COMMON_RESTRICTIONS.map(r => (
              <label
                key={r}
                className={`flex items-center p-4 border rounded-xl cursor-pointer transition-colors ${restrictions.includes(r) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50 bg-card'}`}
                data-testid={`label-settings-restriction-${r.toLowerCase().replace(/\s+/g, '-')}`}
              >
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

          <div className="pt-2">
            <Label className="text-sm font-medium mb-2 block">Add other restriction</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Garlic allergy"
                value={customRestriction}
                onChange={(e) => setCustomRestriction(e.target.value)}
                onKeyDown={addCustomRestriction}
                className="h-12 rounded-xl"
                data-testid="input-settings-custom-restriction"
              />
              <Button
                type="button"
                variant="secondary"
                className="h-12 px-6 rounded-xl"
                onClick={addCustomRestriction}
                data-testid="button-settings-add-restriction"
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-base font-bold">Taste Preferences</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Optional. Used to highlight dishes you'll enjoy — does not affect
              safety warnings.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {COMMON_PREFERENCES.map(p => (
              <label
                key={p}
                className={`flex items-center p-4 border rounded-xl cursor-pointer transition-colors ${preferences.includes(p) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50 bg-card'}`}
                data-testid={`label-settings-preference-${p.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Checkbox
                  checked={preferences.includes(p)}
                  onCheckedChange={() => togglePreference(p)}
                  className="mr-4 w-5 h-5"
                />
                <span className="text-base font-medium">{p}</span>
              </label>
            ))}

            {preferences.filter(p => !COMMON_PREFERENCES.includes(p)).map(p => (
              <label key={p} className="flex items-center p-4 border rounded-xl border-primary bg-primary/5 cursor-pointer">
                <Checkbox checked={true} onCheckedChange={() => togglePreference(p)} className="mr-4 w-5 h-5" />
                <span className="text-base font-medium">{p}</span>
              </label>
            ))}
          </div>

          <div className="pt-2">
            <Label className="text-sm font-medium mb-2 block">Add another preference</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Lots of garlic"
                value={customPreference}
                onChange={(e) => setCustomPreference(e.target.value)}
                onKeyDown={addCustomPreference}
                className="h-12 rounded-xl"
                data-testid="input-settings-custom-preference"
              />
              <Button
                type="button"
                variant="secondary"
                className="h-12 px-6 rounded-xl"
                onClick={addCustomPreference}
                data-testid="button-settings-add-preference"
              >
                Add
              </Button>
            </div>
          </div>

          <div className="pt-2">
            <Label htmlFor="settings-preference-notes" className="text-sm font-medium mb-2 block">
              Notes
            </Label>
            <Textarea
              id="settings-preference-notes"
              placeholder="e.g. I love seafood, can't stand mushrooms."
              value={preferenceNotes}
              onChange={(e) => setPreferenceNotes(e.target.value)}
              className="min-h-[96px] rounded-xl text-base"
              data-testid="input-settings-preference-notes"
            />
          </div>
        </div>

        <Button
          size="lg"
          className="w-full h-14 text-lg rounded-xl mt-8"
          onClick={saveSettings}
          data-testid="button-save-settings"
        >
          Save Changes
        </Button>

        <button
          onClick={() => setLocation("/insights")}
          className="w-full flex items-center gap-3 p-4 border rounded-xl bg-card hover:bg-muted/50 transition-colors text-left"
          data-testid="button-open-insights"
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Personalized risk model</p>
            <p className="text-xs text-muted-foreground">
              See how your model is learning from your reactions.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
        </button>
      </div>
    </div>
  );
}
