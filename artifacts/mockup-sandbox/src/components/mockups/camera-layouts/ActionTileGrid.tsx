import React from "react";
import { Camera, Image as ImageIcon, Clock, Settings, ShoppingBag, Sparkles } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import "./_group.css";

export function ActionTileGrid() {
  return (
    <div className="camera-layout-root min-h-screen flex justify-center bg-[hsl(20_14%_94%)] font-sans">
      <div className="relative w-[390px] mx-auto min-h-[844px] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-2xl overflow-hidden flex flex-col pb-20">
        
        {/* Header */}
        <div className="px-6 pt-14 pb-6">
          <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-1">Scan Menu</h1>
          <p className="text-[hsl(var(--muted-foreground))] text-sm font-medium">Checking for 3 restrictions</p>
        </div>

        {/* Content */}
        <div className="px-6 flex flex-col gap-8 flex-1">
          {/* Language Picker */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Menu language</Label>
            <Select defaultValue="auto">
              <SelectTrigger className="w-full h-12 bg-[hsl(var(--card))] border-[hsl(var(--border))] rounded-xl shadow-sm text-base">
                <SelectValue placeholder="Auto-detect" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action Tile Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Tile 1: Primary (Camera) */}
            <button className="flex flex-col items-start justify-between p-5 h-40 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-md transition-transform active:scale-95 text-left border border-[hsl(var(--primary))]">
              <div className="p-2.5 bg-white/20 rounded-xl">
                <Camera size={24} className="text-white" />
              </div>
              <div className="w-full">
                <h3 className="font-semibold text-base mb-0.5 leading-tight">Use Camera</h3>
                <p className="text-white/80 text-xs">Snap a menu now</p>
              </div>
            </button>

            {/* Tile 2: Secondary (Gallery) */}
            <button className="flex flex-col items-start justify-between p-5 h-40 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-sm transition-transform active:scale-95 text-left">
              <div className="p-2.5 bg-[hsl(var(--primary))]/10 rounded-xl">
                <ImageIcon size={24} className="text-[hsl(var(--primary))]" />
              </div>
              <div className="w-full">
                <h3 className="font-semibold text-[hsl(var(--foreground))] text-base mb-0.5 leading-tight text-balance">Upload from Gallery</h3>
                <p className="text-[hsl(var(--muted-foreground))] text-xs">Pick a saved photo</p>
              </div>
            </button>

            {/* Tile 3: Recent Scans */}
            <button className="flex flex-col items-start justify-between p-5 h-40 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-sm transition-transform active:scale-95 text-left">
              <div className="p-2.5 bg-[hsl(var(--primary))]/10 rounded-xl">
                <Clock size={24} className="text-[hsl(var(--primary))]" />
              </div>
              <div className="w-full">
                <h3 className="font-semibold text-[hsl(var(--foreground))] text-base mb-0.5 leading-tight">Recent Scans</h3>
                <p className="text-[hsl(var(--muted-foreground))] text-xs">3 saved menus</p>
              </div>
            </button>

            {/* Tile 4: Sample Menu */}
            <button className="flex flex-col items-start justify-between p-5 h-40 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-sm transition-transform active:scale-95 text-left">
              <div className="p-2.5 bg-[hsl(var(--primary))]/10 rounded-xl">
                <Sparkles size={24} className="text-[hsl(var(--primary))]" />
              </div>
              <div className="w-full">
                <h3 className="font-semibold text-[hsl(var(--foreground))] text-base mb-0.5 leading-tight">Sample Menu</h3>
                <p className="text-[hsl(var(--muted-foreground))] text-xs">Try a demo</p>
              </div>
            </button>
          </div>
        </div>

        {/* Bottom Nav */}
        <div className="absolute bottom-0 left-0 right-0 border-t bg-[hsl(var(--background))]/80 backdrop-blur-xl z-50">
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

export default ActionTileGrid;
