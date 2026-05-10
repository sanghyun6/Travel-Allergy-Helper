import { useState, useEffect } from "react";
import { useProfile } from "@/context/store-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { COMMON_RESTRICTIONS, LANGUAGES } from "@/lib/constants";

export default function SettingsPage() {
  const { profile, setProfile } = useProfile();
  const { toast } = useToast();

  const [nativeLanguage, setNativeLanguage] = useState("");
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [customRestriction, setCustomRestriction] = useState("");

  useEffect(() => {
    if (profile) {
      setNativeLanguage(profile.nativeLanguage);
      setRestrictions(profile.restrictions);
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

  const saveSettings = () => {
    setProfile({ nativeLanguage, restrictions });
    toast({ title: "Settings saved", description: "Your profile has been updated." });
  };

  if (!profile) return null;

  return (
    <div className="min-h-[100dvh] pb-24 bg-background flex flex-col max-w-md mx-auto w-full">
      <header className="p-4 border-b bg-card sticky top-0 z-10">
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

        <Button
          size="lg"
          className="w-full h-14 text-lg rounded-xl mt-8"
          onClick={saveSettings}
          data-testid="button-save-settings"
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
}
