import React from "react";
import "./_group.css";
import { Camera, Image as ImageIcon, ShoppingBag, Clock, Settings, ChevronDown, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CameraFirstHero() {
  return (
    <div className="camera-layout-root min-h-screen flex justify-center bg-[hsl(20_14%_94%)]">
      <div className="relative w-[390px] mx-auto min-h-[844px] bg-[hsl(var(--background))] overflow-hidden shadow-2xl">
        
        {/* Top 65%: Viewfinder */}
        <div className="absolute top-0 left-0 right-0 h-[65%] bg-zinc-900 flex flex-col">
          {/* Top Bar inside viewfinder */}
          <div className="flex justify-between items-start p-4 pt-12 relative z-20">
            <div className="w-8" /> {/* Spacer for centering if needed, or back button */}
            
            {/* Floating Language Picker */}
            <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md text-white/90 px-3 py-1.5 rounded-full text-xs font-medium border border-white/10">
              <span>Menu language: Auto-detect</span>
              <ChevronDown size={14} className="opacity-70" />
            </div>
          </div>

          {/* Viewfinder Center */}
          <div className="flex-1 relative flex items-center justify-center p-8">
            {/* Brackets */}
            <div className="absolute top-8 left-8 w-12 h-12 border-t-2 border-l-2 border-white/30 rounded-tl-xl" />
            <div className="absolute top-8 right-8 w-12 h-12 border-t-2 border-r-2 border-white/30 rounded-tr-xl" />
            <div className="absolute bottom-8 left-8 w-12 h-12 border-b-2 border-l-2 border-white/30 rounded-bl-xl" />
            <div className="absolute bottom-8 right-8 w-12 h-12 border-b-2 border-r-2 border-white/30 rounded-br-xl" />
            
            {/* Shimmer / Scan line */}
            <div className="absolute top-1/4 left-8 right-8 h-[1px] bg-white/40 shadow-[0_0_15px_rgba(255,255,255,0.5)] animate-pulse" />
            
            {/* Menu Silhouette Hint */}
            <div className="w-full h-full border border-white/5 rounded opacity-20 bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.05)_50%,transparent_100%)] flex items-center justify-center">
              <ScanLine size={48} className="text-white/20" />
            </div>
          </div>
        </div>

        {/* Bottom 35%: Docked Card */}
        <div className="absolute bottom-16 left-0 right-0 h-[38%] bg-[hsl(var(--background))] rounded-t-[2.5rem] p-6 pt-8 flex flex-col z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
          <div className="mb-auto text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-1">Scan Menu</h1>
            <p className="text-[hsl(var(--muted-foreground))] text-sm font-medium">Checking for 3 restrictions</p>
          </div>
          
          <div className="flex flex-col gap-3 mt-6">
            <Button size="lg" className="w-full h-14 rounded-2xl text-base font-semibold bg-[hsl(var(--primary))] text-primary-foreground hover:bg-[hsl(var(--primary))/90] shadow-lg shadow-[hsl(var(--primary))]/20">
              <Camera className="w-5 h-5 mr-2" />
              Use Camera
            </Button>
            <Button variant="ghost" size="lg" className="w-full h-12 rounded-2xl text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--primary))/5] font-medium">
              <ImageIcon className="w-4 h-4 mr-2" />
              Upload from Gallery
            </Button>
          </div>
        </div>

        {/* Bottom Nav */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/90 backdrop-blur-xl z-50">
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

export default CameraFirstHero;
