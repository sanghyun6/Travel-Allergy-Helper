import React from 'react';
import './_group.css';
import { Camera, Image as ImageIcon, ShoppingBag, Clock, Settings, Check, Lock, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function StepChecklist() {
  return (
    <div className="camera-layout-root min-h-screen flex justify-center bg-[hsl(20_14%_94%)]">
      <div className="relative w-[390px] bg-[hsl(var(--background))] overflow-hidden flex flex-col mx-auto min-h-[844px] shadow-2xl">
        {/* Header */}
        <header className="px-6 pt-12 pb-6 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Scan Menu</h1>
          <div className="flex items-center gap-2 mt-2">
            <ShieldAlert size={16} className="text-[hsl(var(--primary))]" />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Checking for 3 restrictions</p>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-24 px-4 pt-6 space-y-4">
          
          {/* Step 1 */}
          <div className="flex gap-4 p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] opacity-80">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
              <Check size={16} strokeWidth={3} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-2">Pick menu language</h3>
              <Select defaultValue="auto">
                <SelectTrigger className="w-full h-9 bg-white">
                  <SelectValue placeholder="Auto-detect" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="it">Italian</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Step 2 - Active */}
          <div className="flex gap-4 p-5 rounded-xl border-l-4 border-l-[hsl(var(--primary))] border-[hsl(var(--border))] bg-white shadow-sm relative">
            <div className="absolute top-0 right-0 p-3">
               <div className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] animate-pulse"></div>
            </div>
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center text-white font-bold shadow-md">
              2
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-[hsl(var(--foreground))] mb-1">Capture or upload</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">Take a clear photo of the foreign menu to translate and analyze.</p>
              
              <div className="space-y-3">
                <Button className="w-full h-12 text-base shadow-md group" size="lg">
                  <Camera className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform" />
                  Use Camera
                </Button>
                <Button variant="outline" className="w-full h-12 text-base border-dashed border-2 hover:bg-[hsl(var(--muted))]" size="lg">
                  <ImageIcon className="mr-2 h-5 w-5 text-[hsl(var(--muted-foreground))]" />
                  Upload from Gallery
                </Button>
              </div>
            </div>
          </div>

          {/* Step 3 - Disabled */}
          <div className="flex gap-4 p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] opacity-60">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold">
              3
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">Review allergens</h3>
                <Lock size={14} className="text-[hsl(var(--muted-foreground))]" />
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Scan a menu to see allergen analysis</p>
            </div>
          </div>

        </div>

        {/* Bottom Nav */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur-xl z-50">
          <nav className="flex items-center justify-around h-16 px-4">
            {[
              { icon: Camera,       label: "Camera",   active: true  },
              { icon: ShoppingBag,  label: "Cart",     active: false, badge: 0 },
              { icon: Clock,        label: "History",  active: false },
              { icon: Settings,     label: "Settings", active: false },
            ].map(({ icon: Icon, label, active }) => (
              <div key={label} className="relative flex flex-col items-center justify-center w-16 h-full text-[hsl(var(--muted-foreground))]">
                <div className={`flex flex-col items-center gap-1 ${active ? "text-[hsl(var(--primary))]" : ""}`}>
                  <Icon size={24} strokeWidth={active ? 2.5 : 2} />
                  <span className="text-[10px] font-medium">{label}</span>
                </div>
              </div>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

export default StepChecklist;