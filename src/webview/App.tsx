import { useState, useRef, useEffect, useCallback, ReactNode, Dispatch, SetStateAction, CSSProperties } from "react";
import velaLogo from "./assets/vela-logo-v2.png";
import type { Friend as StoredFriend, InstallProgress, LaunchStatus, MsAuthStatus, PersistShape, StoredAccount } from "@shared/types";

// ─── Color utilities ──────────────────────────────────────────────────────────
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, max ? d / max : 0, max];
}
function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  return isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number) { return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join(""); }

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen = "visuals" | "hud" | "utilities" | "markers" | "friends" | "configs";
type AppView = "loading" | "mainmenu" | "accounts" | "client";

function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(`vela:${key}`);
      if (!stored) return initial;
      const parsed = JSON.parse(stored) as T;
      if (initial && parsed && typeof initial === "object" && typeof parsed === "object" && !Array.isArray(initial) && !Array.isArray(parsed))
        return { ...initial, ...parsed } as T;
      return parsed;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(`vela:${key}`, JSON.stringify(value)); } catch { /* Storage may be unavailable in preview mode. */ }
  }, [key, value]);
  return [value, setValue];
}

// ─── Brand/LogoAsset ──────────────────────────────────────────────────────────
function LogoAsset({ size = 28 }: { size?: number }) {
  return <img src={velaLogo} alt="" draggable={false} style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }} />;
}

// ─── System icons (chevron, x, back, search, settings) ───────────────────────
const Ico = {
  chevron: (rot = 0) => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${rot}deg)` }}><path d="M2.5 4.5L6 8l3.5-3.5" /></svg>,
  x: <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>,
  back: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3L5 7l4 4" /></svg>,
  search: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="4" /><path d="M9.5 9.5L13 13" /></svg>,
  settings: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="7.5" r="2" /><path d="M7.5 1v1.2M7.5 12.8V14M1 7.5h1.2M12.8 7.5H14M3.04 3.04l.85.85M11.11 11.11l.85.85M11.96 3.04l-.85.85M3.89 11.11l-.85.85" /></svg>,
  plus: <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6.5 2v9M2 6.5h9" /></svg>,
  trash: <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3.5h9M4.5 3.5V2h4v1.5M4 3.5l.5 7h4l.5-7" /></svg>,
  check: <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 6l3 3L10.5 2" /></svg>,
  copy: <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" /><path d="M2 9.5V2h7.5" /></svg>,
  edit: <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 2.5l3.5 3.5-7 7H0v-3.5z" /></svg>,
  star: <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 1.5l1.4 3 3.2.3-2.3 2.2.7 3.2L6.5 8.5 3 10.2l.7-3.2L1.4 4.8l3.2-.3z" /></svg>,
  download: <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 2v6.5M4 6l2.5 2.5L9 6M2 11h9" /></svg>,
  upload: <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 8V1.5M4 4l2.5-2.5L9 4M2 11h9" /></svg>,
  arrow: <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6h8M7 3l3 3-3 3" /></svg>,
};

// ─── Sidebar nav icons (16×16) ────────────────────────────────────────────────
const NavIco = {
  visuals: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" /><circle cx="8" cy="8" r="2" /></svg>,
  hud: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="2.5" width="14" height="11" rx="2" /><path d="M4 10.5h2M8 10.5h4M4 7.5h8" /></svg>,
  utilities: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2a4 4 0 0 1 0 5.66L4.83 12.83A1.5 1.5 0 0 1 2.7 10.7L7.88 5.53A4 4 0 0 1 10 2z" /><circle cx="11" cy="4" r="1" /></svg>,
  markers: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2a4 4 0 0 1 4 4c0 2.5-4 8-4 8S4 8.5 4 6a4 4 0 0 1 4-4z" /><circle cx="8" cy="6" r="1.5" /></svg>,
  friends: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.5" /><path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4" /><path d="M11 5a2 2 0 0 1 0 4M14 13c0-1.5-1-2.8-3-3.5" /></svg>,
  configs: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3H7.5A2.5 2.5 0 0 0 5 5.5V13M5 5.5A2.5 2.5 0 0 0 2.5 8H10a2 2 0 0 1 2 2v3" /></svg>,
};

// ─── Primitives ───────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={checked} onClick={onChange} disabled={disabled}
      className="relative flex-shrink-0 rounded-full transition-all duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#756CFF] focus-visible:ring-offset-1 focus-visible:ring-offset-[#141923]"
      style={{ width: 28, height: 16, background: checked ? "#756CFF" : "#252D3D", opacity: disabled ? 0.38 : 1 }}>
      <span className="absolute rounded-full bg-white transition-all duration-[150ms]"
        style={{ width: 10, height: 10, top: 3, left: checked ? 15 : 3, boxShadow: "0 1px 2px rgba(0,0,0,.4)" }} />
    </button>
  );
}

function RangeSlider({ value, onChange, min = 0, max = 100, label, colorStop }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string; colorStop?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const bg = colorStop
    ? `linear-gradient(90deg, ${colorStop} ${pct}%, #252D3D ${pct}%)`
    : `linear-gradient(90deg, #756CFF ${pct}%, #252D3D ${pct}%)`;
  return (
    <div className="flex flex-col gap-1">
      {label && <div className="flex justify-between"><span className="text-[11px] font-medium" style={{ color: "#9AA4B6" }}>{label}</span><span className="text-[11px]" style={{ color: "#626D80" }}>{value}</span></div>}
      <div className="relative h-3 flex items-center">
        <div className="absolute w-full h-[2px] rounded-full" style={{ background: bg }} />
        <input type="range" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)}
          className="absolute w-full h-3 opacity-0 cursor-pointer" style={{ zIndex: 2 }} />
        <div className="absolute w-3 h-3 rounded-full bg-white pointer-events-none" style={{ left: `calc(${pct}% - 6px)`, boxShadow: "0 1px 3px rgba(0,0,0,.4)", zIndex: 1 }} />
      </div>
    </div>
  );
}

function SegCtrl({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-[7px] p-[2px]" style={{ background: "#0C1017" }}>
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)}
          className="flex-1 text-[11px] font-medium rounded-[5px] py-0.5 px-1.5 transition-all duration-100"
          style={{ background: value === opt ? "#141923" : "transparent", color: value === opt ? "#F3F5FA" : "#626D80" }}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function Sel({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="text-[12px] font-medium rounded-[8px] px-2 py-1 appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#756CFF]"
      style={{ background: "#0C1017", color: "#F3F5FA", border: "1px solid #252D3D" }}>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  );
}

function CtrlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px]" style={{ color: "#9AA4B6" }}>{label}</span>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// ─── Custom Color Picker ──────────────────────────────────────────────────────
function ColorPicker({ value, onChange, onClose, recentColors, onUsed }: {
  value: string; onChange: (c: string) => void; onClose: () => void; recentColors: string[]; onUsed: (c: string) => void;
}) {
  const rgb0 = hexToRgb(value) ?? [117, 108, 255];
  const hsv0 = rgbToHsv(...rgb0);
  const [h, setH] = useState(hsv0[0]);
  const [s, setS] = useState(hsv0[1]);
  const [v, setV] = useState(hsv0[2]);
  const [a, setA] = useState(1);
  const [hexInput, setHexInput] = useState(value);
  const [hexError, setHexError] = useState(false);
  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const rgb = hsvToRgb(h, s, v);
  const currentHex = rgbToHex(...rgb);

  useEffect(() => { setHexInput(currentHex); }, [currentHex]);

  useEffect(() => {
    const canvas = svCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const gh = ctx.createLinearGradient(0, 0, W, 0);
    gh.addColorStop(0, "#fff"); gh.addColorStop(1, `hsl(${h},100%,50%)`);
    ctx.fillStyle = gh; ctx.fillRect(0, 0, W, H);
    const gv = ctx.createLinearGradient(0, 0, 0, H);
    gv.addColorStop(0, "rgba(0,0,0,0)"); gv.addColorStop(1, "#000");
    ctx.fillStyle = gv; ctx.fillRect(0, 0, W, H);
  }, [h]);

  const onSVMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const update = (ev: MouseEvent | React.MouseEvent) => {
      const rect = svCanvasRef.current!.getBoundingClientRect();
      setS(Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)));
      setV(1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height)));
    };
    update(e);
    const onMove = (ev: MouseEvent) => update(ev);
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  };

  const getAngle = (e: MouseEvent | React.MouseEvent): number => {
    const el = ringRef.current; if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let ang = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90;
    if (ang < 0) ang += 360;
    return Math.round(ang) % 360;
  };
  const isOnRing = (e: React.MouseEvent): boolean => {
    const el = ringRef.current; if (!el) return false;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const dx = e.clientX - rect.left - cx, dy = e.clientY - rect.top - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    return d >= cx - 17 && d <= cx;
  };
  const onRingDown = (e: React.MouseEvent) => {
    if (!isOnRing(e)) return;
    setH(getAngle(e));
    const onMove = (ev: MouseEvent) => setH(getAngle(ev));
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  };

  const thumbAngle = (h - 90) * (Math.PI / 180);
  const RING_SIZE = 134, SV_SIZE = 80, ringR = 60;
  const thumbX = RING_SIZE / 2 + ringR * Math.cos(thumbAngle);
  const thumbY = RING_SIZE / 2 + ringR * Math.sin(thumbAngle);

  const onHex = (raw: string) => {
    setHexInput(raw);
    const clean = raw.startsWith("#") ? raw : "#" + raw;
    const parsed = hexToRgb(clean);
    if (parsed) { const [hh, ss, vv] = rgbToHsv(...parsed); setH(hh); setS(ss); setV(vv); setHexError(false); }
    else setHexError(true);
  };
  const onHexBlur = () => { if (hexError) setHexInput(currentHex); setHexError(false); };

  return (
    <div className="rounded-[12px] overflow-hidden flex flex-col" style={{ width: 260, background: "#141923", border: "1px solid #252D3D", boxShadow: "0 8px 32px rgba(0,0,0,.5)" }}>
      <div className="flex flex-col items-center pt-3 pb-2 gap-2">
        <div ref={ringRef} className="relative cursor-crosshair" style={{ width: RING_SIZE, height: RING_SIZE }} onMouseDown={onRingDown}>
          <div className="absolute inset-0 rounded-full" style={{
            background: "conic-gradient(hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%))",
            WebkitMask: `radial-gradient(circle, transparent ${RING_SIZE / 2 - 16}px, black ${RING_SIZE / 2 - 16}px)`,
            mask: `radial-gradient(circle, transparent ${RING_SIZE / 2 - 16}px, black ${RING_SIZE / 2 - 16}px)`,
          }} />
          <div className="absolute rounded-full border-2 border-white pointer-events-none"
            style={{ width: 14, height: 14, left: thumbX - 7, top: thumbY - 7, background: `hsl(${h},100%,50%)`, boxShadow: "0 1px 4px rgba(0,0,0,.5)" }} />
          <div className="absolute rounded-[4px] overflow-hidden" style={{ left: (RING_SIZE - SV_SIZE) / 2, top: (RING_SIZE - SV_SIZE) / 2, width: SV_SIZE, height: SV_SIZE }}>
            <canvas ref={svCanvasRef} width={SV_SIZE} height={SV_SIZE} className="cursor-crosshair" onMouseDown={onSVMouseDown} style={{ display: "block" }} />
            <div className="absolute rounded-full border-2 border-white pointer-events-none"
              style={{ width: 10, height: 10, left: s * SV_SIZE - 5, top: (1 - v) * SV_SIZE - 5, boxShadow: "0 1px 3px rgba(0,0,0,.5)" }} />
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 w-full">
          <div className="flex-1">
            <RangeSlider value={Math.round(a * 100)} onChange={val => setA(val / 100)} colorStop={currentHex} />
          </div>
          <div className="w-7 h-5 rounded-[5px] border border-[#252D3D] flex-shrink-0" style={{ background: `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})` }} />
        </div>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-3" style={{ borderTop: "1px solid #1A2030" }}>
        <div className="pt-2.5 flex flex-col gap-2">
          {[["R", 0, "#FF4444"], ["G", 1, "#44CC44"], ["B", 2, "#4488FF"]].map(([lbl, i, col]) => (
            <div key={lbl as string} className="flex items-center gap-2">
              <span className="text-[10px] font-semibold w-3 text-right flex-shrink-0" style={{ color: "#626D80" }}>{lbl}</span>
              <div className="flex-1">
                <RangeSlider value={rgb[i as number]} onChange={val => {
                  const nr = [...rgb] as [number, number, number]; nr[i as number] = val;
                  const [hh, ss, vv] = rgbToHsv(...nr); setH(hh); setS(ss); setV(vv);
                }} max={255} colorStop={col as string} />
              </div>
              <span className="text-[10px] w-7 text-right flex-shrink-0" style={{ color: "#626D80" }}>{rgb[i as number]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 pb-3">
        <input value={hexInput} onChange={e => onHex(e.target.value)} onBlur={onHexBlur}
          className="flex-1 px-2 py-1 rounded-[7px] text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-[#756CFF]"
          style={{ background: "#0C1017", color: hexError ? "#FF667C" : "#F3F5FA", border: `1px solid ${hexError ? "#FF667C" : "#252D3D"}` }} />
        <button onClick={() => navigator.clipboard?.writeText(currentHex)} className="text-[10px] font-medium px-2 py-1 rounded-[6px] transition-colors hover:bg-[#191F2B]" style={{ color: "#626D80", border: "1px solid #252D3D" }}>Копировать</button>
        <button onClick={() => { const [hh, ss, vv] = rgbToHsv(...rgb0); setH(hh); setS(ss); setV(vv); }} className="text-[10px] font-medium px-2 py-1 rounded-[6px] transition-colors hover:bg-[#191F2B]" style={{ color: "#626D80", border: "1px solid #252D3D" }}>Сброс</button>
      </div>
      {recentColors.length > 0 && (
        <div className="flex items-center gap-2 px-4 pb-3">
          <span className="text-[10px]" style={{ color: "#626D80" }}>Недавние</span>
          {recentColors.map((c, i) => (
            <button key={i} onClick={() => { const p = hexToRgb(c); if (p) { const [hh, ss, vv] = rgbToHsv(...p); setH(hh); setS(ss); setV(vv); } }}
              className="w-4 h-4 rounded-[3px] transition-transform hover:scale-110 flex-shrink-0" style={{ background: c, border: "1px solid #252D3D" }} />
          ))}
        </div>
      )}
      <div className="flex gap-2 px-4 pb-3">
        <button onClick={() => { onChange(currentHex); onUsed(currentHex); onClose(); }}
          className="flex-1 py-1.5 rounded-[8px] text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "#756CFF" }}>Применить</button>
        <button onClick={onClose} className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-colors hover:bg-[#191F2B]"
          style={{ background: "#0C1017", color: "#9AA4B6", border: "1px solid #252D3D" }}>Отмена</button>
      </div>
    </div>
  );
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
interface CtxPos { x: number; y: number; }

function ContextMenu({ pos, onClose, onSetBind, onBindMode, onReset }: {
  pos: CtxPos; onClose: () => void; onSetBind: () => void; onBindMode: () => void; onReset: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", h); window.addEventListener("keydown", k);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [onClose]);

  return (
    <div ref={ref} className="fixed z-[100] rounded-[10px] py-1 overflow-hidden"
      style={{ left: pos.x, top: pos.y, background: "#141923", border: "1px solid #252D3D", boxShadow: "0 8px 24px rgba(0,0,0,.5)", minWidth: 160 }}>
      {[
        { label: "Назначить клавишу", action: onSetBind },
        { label: "Режим клавиши", action: onBindMode },
        { label: "Сбросить настройки", action: onReset },
        { label: "Подробнее", action: onClose },
      ].map((item, i) => (
        <button key={i} onClick={() => { item.action(); onClose(); }}
          className="flex items-center w-full px-3 py-2 text-left text-[12px] transition-colors hover:bg-[#191F2B]"
          style={{ color: "#F3F5FA" }}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ─── Bind Capture Overlay ─────────────────────────────────────────────────────
function BindCapture({ currentBind, bindMode, onSet, onClear, onClose }: {
  currentBind: string; bindMode: "Toggle" | "Hold"; onSet: (k: string, m: "Toggle" | "Hold") => void; onClear: () => void; onClose: () => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const [mode, setMode] = useState<"Toggle" | "Hold">(bindMode);
  const [preview, setPreview] = useState(currentBind);

  useEffect(() => {
    if (!capturing) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") { setCapturing(false); return; }
      const k = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      setPreview(k); setCapturing(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [capturing]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[90]" style={{ background: "rgba(5,7,10,.6)" }} onClick={onClose}>
      <div className="rounded-[12px] p-5 flex flex-col gap-4" style={{ background: "#141923", border: "1px solid #252D3D", width: 260 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold" style={{ color: "#F3F5FA" }}>Клавиша</span>
          <button onClick={onClose} style={{ color: "#626D80" }}>{Ico.x}</button>
        </div>
        <button onClick={() => setCapturing(true)}
          className="py-2.5 rounded-[9px] text-[13px] font-medium text-center transition-all"
          style={{ background: capturing ? "rgba(117,108,255,.12)" : "#0C1017", color: capturing ? "#756CFF" : preview ? "#F3F5FA" : "#626D80", border: `1px solid ${capturing ? "#756CFF" : "#252D3D"}` }}>
          {capturing ? "Нажмите клавишу…" : preview || "Нажмите для назначения"}
        </button>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium" style={{ color: "#9AA4B6" }}>Режим</span>
          <SegCtrl options={["Toggle", "Hold"]} value={mode} onChange={v => setMode(v as "Toggle" | "Hold")} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => { onClear(); onClose(); }} className="flex-1 py-2 rounded-[8px] text-[12px] font-medium transition-colors hover:bg-[#191F2B]" style={{ background: "#0C1017", color: "#9AA4B6", border: "1px solid #252D3D" }}>Очистить</button>
          <button onClick={() => { if (preview) onSet(preview, mode); onClose(); }} className="flex-1 py-2 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: "#756CFF" }}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

// ─── Module Card ──────────────────────────────────────────────────────────────
function ModuleCard({ name, desc, bind, on, onToggle, onSetBind, children, recentColors, onUsedColor }: {
  name: string; desc: string; bind?: string; on: boolean;
  onToggle: () => void; onSetBind: (k: string, m: "Toggle" | "Hold") => void;
  children?: ReactNode; recentColors: string[]; onUsedColor: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [ctx, setCtx] = useState<CtxPos | null>(null);
  const [bindOpen, setBindOpen] = useState(false);
  const [bindMode, setBindMode] = useState<"Toggle" | "Hold">("Toggle");
  const [currentBind, setCurrentBind] = useState(bind ?? "");

  useEffect(() => setCurrentBind(bind ?? ""), [bind]);

  const onCtx = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtx({ x: Math.min(e.clientX, window.innerWidth - 180), y: Math.min(e.clientY, window.innerHeight - 140) });
  };

  const shadowStyle = hover && !open ? { boxShadow: "0 1px 8px rgba(0,0,0,.25)" } : {};

  return (
    <>
      <div className="rounded-[10px] overflow-hidden select-none"
        style={{
          background: hover ? "#191F2B" : "#141923",
          border: `1px solid ${open || hover ? "#39445B" : "#252D3D"}`,
          minHeight: 66,
          transition: "background 120ms, border-color 120ms, box-shadow 120ms",
          ...shadowStyle,
        }}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onContextMenu={onCtx}>
        <div className="flex items-center gap-2.5 px-3" style={{ height: 66 }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-medium leading-none" style={{ color: on ? "#F3F5FA" : "#9AA4B6" }}>{name}</span>
              {currentBind && hover && !open && (
                <span className="text-[10px]" style={{ color: "#626D80" }}>{currentBind}</span>
              )}
            </div>
            <p className="text-[12px] leading-[17px] mt-0.5 line-clamp-2" style={{ color: "#626D80" }}>{desc}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Toggle checked={on} onChange={onToggle} />
            {children && (
              <button onClick={() => setOpen(!open)} aria-label={`Настройки ${name}`}
                className="w-6 h-6 flex items-center justify-center rounded-[5px] transition-all duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#756CFF]"
                style={{ color: open ? "#756CFF" : "#626D80", background: open ? "rgba(117,108,255,.1)" : "transparent" }}>
                <span className="block transition-transform duration-[190ms]" style={{ transform: open ? "rotate(180deg)" : "none" }}>
                  {Ico.chevron()}
                </span>
              </button>
            )}
          </div>
        </div>
        {open && (
          <div className="px-3 pb-3 flex flex-col gap-2.5" style={{ borderTop: "1px solid #1A2030" }}>
            <div className="flex flex-col gap-2.5 pt-2.5">{children}</div>
          </div>
        )}
      </div>

      {ctx && (
        <ContextMenu pos={ctx} onClose={() => setCtx(null)}
          onSetBind={() => setBindOpen(true)}
          onBindMode={() => setBindMode(m => m === "Toggle" ? "Hold" : "Toggle")}
          onReset={() => { setCurrentBind(""); onSetBind("", bindMode); }} />
      )}
      {bindOpen && (
        <BindCapture currentBind={currentBind} bindMode={bindMode}
          onSet={(k, m) => { setCurrentBind(k); setBindMode(m); onSetBind(k, m); }}
          onClear={() => { setCurrentBind(""); onSetBind("", bindMode); }}
          onClose={() => setBindOpen(false)} />
      )}
    </>
  );
}

// ─── Color picker trigger ─────────────────────────────────────────────────────
function ColorTrigger({ value, onChange, recentColors, onUsed }: { value: string; onChange: (c: string) => void; recentColors: string[]; onUsed: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 transition-all hover:scale-105">
        <div className="w-5 h-5 rounded-[4px]" style={{ background: value, border: "1px solid #39445B" }} />
        <span className="text-[11px] font-mono" style={{ color: "#626D80" }}>{value.toUpperCase()}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] grid place-items-center" style={{ background: "rgba(5,7,10,.68)", backdropFilter: "blur(5px)" }} onMouseDown={() => setOpen(false)}>
          <div onMouseDown={event => event.stopPropagation()}>
            <ColorPicker value={value} onChange={onChange} onClose={() => setOpen(false)} recentColors={recentColors} onUsed={c => { onUsed(c); setOpen(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings Side Sheet ──────────────────────────────────────────────────────
function SettingsPanel({ onClose, accentColor, onAccentChange, recentColors, onUsed }: {
  onClose: () => void; accentColor: string; onAccentChange: (c: string) => void; recentColors: string[]; onUsed: (c: string) => void;
}) {
  const [tab, setTab] = useState<"Appearance" | "Interface" | "Sounds" | "Controls">("Appearance");
  const [uiScale, setUiScale] = usePersistentState("settings.uiScale", 100);
  const [animations, setAnimations] = usePersistentState("settings.animations", true);
  const [reducedMotion, setReducedMotion] = usePersistentState("settings.reducedMotion", false);
  const [tooltips, setTooltips] = usePersistentState("settings.tooltips", true);
  const [sounds, setSounds] = usePersistentState("settings.sounds", true);
  const [volume, setVolume] = usePersistentState("settings.volume", 70);
  const [surfaceOpacity, setSurfaceOpacity] = usePersistentState("settings.surfaceOpacity", 95);
  const TABS = ["Appearance", "Interface", "Sounds", "Controls"] as const;
  const PRESETS = ["#756CFF", "#55CFFF", "#45D39A", "#FF667C", "#F7BC62", "#FF8855"];

  return (
    <div className="absolute inset-0 flex z-40" style={{ background: "rgba(5,7,10,.5)" }} onClick={onClose}>
      <div className="ml-auto flex flex-col h-full animate-fade-slide" style={{ width: 300, background: "#0B0E14", borderLeft: "1px solid #252D3D" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid #1A2030" }}>
          <span className="text-[14px] font-semibold" style={{ color: "#F3F5FA" }}>Настройки</span>
          <button onClick={onClose} style={{ color: "#626D80" }} className="hover:text-[#F3F5FA] transition-colors">{Ico.x}</button>
        </div>
        <div className="flex border-b" style={{ borderColor: "#1A2030" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2.5 text-[11px] font-medium transition-colors"
              style={{ color: tab === t ? "#F3F5FA" : "#626D80", borderBottom: `2px solid ${tab === t ? "#756CFF" : "transparent"}` }}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {tab === "Appearance" && (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold" style={{ color: "#626D80" }}>АКЦЕНТНЫЙ ЦВЕТ</p>
                <div className="flex gap-2 flex-wrap">
                  {PRESETS.map(c => (
                    <button key={c} onClick={() => onAccentChange(c)}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                      style={{ background: c, outline: accentColor === c ? `2px solid ${c}` : "none", outlineOffset: 2 }} />
                  ))}
                </div>
                <ColorTrigger value={accentColor} onChange={onAccentChange} recentColors={recentColors} onUsed={onUsed} />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold" style={{ color: "#626D80" }}>ПРОЗРАЧНОСТЬ ПОВЕРХНОСТЕЙ</p>
                <RangeSlider value={surfaceOpacity} onChange={setSurfaceOpacity} label="Непрозрачность" />
              </div>
            </>
          )}
          {tab === "Interface" && (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-[11px] font-semibold" style={{ color: "#626D80" }}>МАСШТАБ UI</p>
                <RangeSlider value={uiScale} onChange={setUiScale} min={75} max={115} label={`${uiScale}%`} />
              </div>
              <CtrlRow label="Анимации"><Toggle checked={animations} onChange={() => setAnimations(!animations)} /></CtrlRow>
              <CtrlRow label="Reduced Motion"><Toggle checked={reducedMotion} onChange={() => setReducedMotion(!reducedMotion)} /></CtrlRow>
              <CtrlRow label="Подсказки"><Toggle checked={tooltips} onChange={() => setTooltips(!tooltips)} /></CtrlRow>
            </>
          )}
          {tab === "Sounds" && (
            <>
              <CtrlRow label="Звуки интерфейса"><Toggle checked={sounds} onChange={() => setSounds(!sounds)} /></CtrlRow>
              <RangeSlider label="Громкость" value={volume} onChange={setVolume} />
              {[["Открытие GUI", 80], ["Модуль вкл/выкл", 60], ["Dropdown", 40], ["Контекстное меню", 40]].map(([lbl, vol]) => (
                <div key={lbl as string} className="flex items-center justify-between">
                  <span className="text-[12px]" style={{ color: "#9AA4B6" }}>{lbl}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: "#626D80" }}>{vol}%</span>
                    <button onClick={() => { const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = 520; gain.gain.value = sounds ? (Number(vol) / 100) * (volume / 100) * 0.08 : 0; oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.07); }} className="text-[10px] font-medium px-2 py-0.5 rounded-[5px] transition-colors hover:border-[#39445B]" style={{ color: "#626D80", border: "1px solid #252D3D", background: "#0C1017" }}>▶</button>
                  </div>
                </div>
              ))}
            </>
          )}
          {tab === "Controls" && (
            <>
              {[["Открыть GUI", "Shift+F"], ["Поиск", "Ctrl+K"], ["Режим перетаскивания", "Нет"]].map(([lbl, k]) => (
                <CtrlRow key={lbl as string} label={lbl as string}>
                  <span className="text-[11px] px-2 py-0.5 rounded-[5px] font-medium" style={{ background: "#0C1017", color: "#9AA4B6", border: "1px solid #252D3D" }}>{k}</span>
                </CtrlRow>
              ))}
              <button onClick={() => { localStorage.removeItem("vela:modules.binds"); window.location.reload(); }} className="py-2 rounded-[8px] text-[12px] font-medium transition-colors hover:border-[#39445B] mt-2" style={{ background: "#0C1017", color: "#9AA4B6", border: "1px solid #252D3D" }}>Сбросить клавиши</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Screen content ───────────────────────────────────────────────────────────
function EmptySearch() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#141923", color: "#626D80" }}>{Ico.search}</div>
      <p className="text-[12px]" style={{ color: "#626D80" }}>Ничего не найдено</p>
    </div>
  );
}

function ScreenContent({ screen, searchQ, recentColors, onUsedColor }: {
  screen: Screen; searchQ: string; recentColors: string[]; onUsedColor: (c: string) => void;
}) {
  const [on, setOn] = usePersistentState<Record<string, boolean>>("modules.enabled", { fullbright: true, keys: true, coords: true, reconnect: true, timestamps: true });
  const [binds, setBinds] = usePersistentState<Record<string, string>>("modules.binds", { fullbright: "F", particles: "P", entityhl: "H", screenshot: "F2", quickcmds: "Z" });
  const [sl, setSl] = usePersistentState("modules.sliders", { parts: 65, hitOp: 70, blur: 28, ehOp: 80, fullbright: 100, hudScale: 100, hudOpacity: 100 });
  const [col, setCol] = usePersistentState("modules.colors", { sky: "#1C2A5E", hit: "#FF667C", eh: "#756CFF" });
  const [skyP, setSkyP] = usePersistentState("modules.skyPreset", "Dusk");
  const [hlMode, setHlMode] = usePersistentState("modules.highlightMode", "Outline");
  const [partType, setPartType] = usePersistentState("modules.particleType", "Default");
  const [blurType, setBlurType] = usePersistentState("modules.blurType", "Radial");
  const [hudStyle, setHudStyle] = usePersistentState("modules.hudStyle", "Default");
  const [hudBackground, setHudBackground] = usePersistentState("modules.hudBackground", "None");
  const [screenshotFormat, setScreenshotFormat] = usePersistentState("modules.screenshotFormat", "PNG");
  const [screenshotCopy, setScreenshotCopy] = usePersistentState("modules.screenshotCopy", true);
  const [delay, setDelay] = usePersistentState("modules.reconnectDelay", 3);
  const [fmt, setFmt] = usePersistentState("modules.timestampFormat", "HH:mm");

  const toggle = (id: string) => setOn(s => ({ ...s, [id]: !s[id] }));

  const modules: { id: string; name: string; desc: string; bind?: string; screen: Screen }[] = [
    { id: "fullbright", name: "Fullbright", desc: "Максимальный уровень освещения повсюду", bind: "F", screen: "visuals" },
    { id: "customsky", name: "Custom Sky", desc: "Замена неба цветом или градиентом", screen: "visuals" },
    { id: "particles", name: "Particles", desc: "Фильтрация и плотность частиц", bind: "P", screen: "visuals" },
    { id: "hitcolor", name: "Hit Color", desc: "Цвет вспышки при уроне по сущности", screen: "visuals" },
    { id: "motionblur", name: "Motion Blur", desc: "Размытие камеры пропорционально движению", screen: "visuals" },
    { id: "entityhl", name: "Entity Highlight", desc: "Контур или заливка вокруг ближайших сущностей", bind: "H", screen: "visuals" },
    { id: "armor", name: "Armor", desc: "Прочность брони и список предметов", screen: "hud" },
    { id: "keys", name: "Keystrokes", desc: "Отображение нажатых клавиш управления", screen: "hud" },
    { id: "coords", name: "Coordinates", desc: "Текущие координаты X Y Z в мире", screen: "hud" },
    { id: "effects", name: "Effects", desc: "Активные эффекты зелий с таймером", screen: "hud" },
    { id: "ping", name: "Ping", desc: "Задержка соединения с сервером", screen: "hud" },
    { id: "cps", name: "CPS", desc: "Счётчик кликов в секунду", screen: "hud" },
    { id: "reconnect", name: "Auto Reconnect", desc: "Автоматическое переподключение к серверу", screen: "utilities" },
    { id: "screenshot", name: "Screenshot Manager", desc: "Захват и хранение скриншотов в игре", bind: "F2", screen: "utilities" },
    { id: "timestamps", name: "Chat Timestamps", desc: "Метки времени в каждом сообщении чата", screen: "utilities" },
    { id: "invpreview", name: "Inventory Preview", desc: "Просмотр инвентаря игрока при наведении", screen: "utilities" },
    { id: "quickcmds", name: "Quick Commands", desc: "Быстрые команды по настраиваемой клавише", bind: "Z", screen: "utilities" },
  ];

  const filtered = modules.filter(m => m.screen === screen).filter(m =>
    !searchQ || m.name.toLowerCase().includes(searchQ.toLowerCase()) || m.desc.toLowerCase().includes(searchQ.toLowerCase())
  );

  const cardProps = (m: typeof modules[0]) => ({
    name: m.name, desc: m.desc, bind: binds[m.id] ?? m.bind,
    on: on[m.id] ?? false,
    onToggle: () => toggle(m.id),
    onSetBind: (k: string) => setBinds(current => ({ ...current, [m.id]: k })),
    recentColors, onUsedColor,
  });

  if (screen === "visuals") return (
    <div className="p-3 overflow-y-auto flex-1">
      {filtered.length === 0 && <EmptySearch />}
      <div className="grid grid-cols-2 gap-2.5">
        {filtered.map(m => (
          <ModuleCard key={m.id} {...cardProps(m)}>
            {m.id === "fullbright" && <CtrlRow label="Сила"><RangeSlider value={sl.fullbright} onChange={value => setSl(state => ({ ...state, fullbright: value }))} min={50} max={100} /></CtrlRow>}
            {m.id === "customsky" && <>
              <CtrlRow label="Пресет"><Sel options={["Dusk", "Aurora", "Night", "Overcast"]} value={skyP} onChange={setSkyP} /></CtrlRow>
              <CtrlRow label="Цвет"><ColorTrigger value={col.sky} onChange={v => setCol(c => ({ ...c, sky: v }))} recentColors={recentColors} onUsed={onUsedColor} /></CtrlRow>
            </>}
            {m.id === "particles" && <>
              <CtrlRow label="Тип"><Sel options={["Default", "Reduced", "Minimal", "None"]} value={partType} onChange={setPartType} /></CtrlRow>
              <CtrlRow label="Плотность"><RangeSlider value={sl.parts} onChange={v => setSl(s => ({ ...s, parts: v }))} /></CtrlRow>
            </>}
            {m.id === "hitcolor" && <>
              <CtrlRow label="Цвет"><ColorTrigger value={col.hit} onChange={v => setCol(c => ({ ...c, hit: v }))} recentColors={recentColors} onUsed={onUsedColor} /></CtrlRow>
              <CtrlRow label="Непрозрачность"><RangeSlider value={sl.hitOp} onChange={v => setSl(s => ({ ...s, hitOp: v }))} /></CtrlRow>
            </>}
            {m.id === "motionblur" && <>
              <CtrlRow label="Тип"><SegCtrl options={["Radial", "Linear"]} value={blurType} onChange={setBlurType} /></CtrlRow>
              <CtrlRow label="Интенсивность"><RangeSlider value={sl.blur} onChange={v => setSl(s => ({ ...s, blur: v }))} /></CtrlRow>
            </>}
            {m.id === "entityhl" && <>
              <CtrlRow label="Режим"><SegCtrl options={["Outline", "Fill", "Both"]} value={hlMode} onChange={setHlMode} /></CtrlRow>
              <CtrlRow label="Цвет"><ColorTrigger value={col.eh} onChange={v => setCol(c => ({ ...c, eh: v }))} recentColors={recentColors} onUsed={onUsedColor} /></CtrlRow>
              <CtrlRow label="Непрозрачность"><RangeSlider value={sl.ehOp} onChange={v => setSl(s => ({ ...s, ehOp: v }))} /></CtrlRow>
            </>}
          </ModuleCard>
        ))}
      </div>
    </div>
  );

  if (screen === "hud") return (
    <div className="p-3 overflow-y-auto flex-1">
      <div className="flex justify-end mb-2">
        <span className="text-[11px]" style={{ color: "#626D80" }}>Режим перетаскивания: кнопка в чате Minecraft</span>
      </div>
      {filtered.length === 0 && <EmptySearch />}
      <div className="grid grid-cols-2 gap-2.5">
        {filtered.map(m => (
          <ModuleCard key={m.id} {...cardProps(m)}>
            <CtrlRow label="Масштаб"><RangeSlider value={sl.hudScale} onChange={value => setSl(state => ({ ...state, hudScale: value }))} min={50} max={200} /></CtrlRow>
            <CtrlRow label="Непрозрачность"><RangeSlider value={sl.hudOpacity} onChange={value => setSl(state => ({ ...state, hudOpacity: value }))} /></CtrlRow>
            <CtrlRow label="Стиль"><Sel options={["Default", "Minimal", "Bordered"]} value={hudStyle} onChange={setHudStyle} /></CtrlRow>
            <CtrlRow label="Фон"><SegCtrl options={["None", "Dim", "Dark"]} value={hudBackground} onChange={setHudBackground} /></CtrlRow>
          </ModuleCard>
        ))}
      </div>
    </div>
  );

  if (screen === "utilities") return (
    <div className="p-3 overflow-y-auto flex-1">
      {filtered.length === 0 && <EmptySearch />}
      <div className="grid grid-cols-2 gap-2.5">
        {filtered.map(m => (
          <ModuleCard key={m.id} {...cardProps(m)}>
            {m.id === "reconnect" && <CtrlRow label="Задержка (с)"><RangeSlider value={delay} onChange={setDelay} min={1} max={30} /></CtrlRow>}
            {m.id === "timestamps" && <CtrlRow label="Формат"><Sel options={["HH:mm", "HH:mm:ss", "h:mm a"]} value={fmt} onChange={setFmt} /></CtrlRow>}
            {m.id === "screenshot" && <>
              <CtrlRow label="Формат"><Sel options={["PNG", "JPEG", "WebP"]} value={screenshotFormat} onChange={setScreenshotFormat} /></CtrlRow>
              <CtrlRow label="Копировать"><Toggle checked={screenshotCopy} onChange={() => setScreenshotCopy(value => !value)} /></CtrlRow>
            </>}
          </ModuleCard>
        ))}
      </div>
    </div>
  );

  if (screen === "markers") return <MarkersScreen searchQ={searchQ} />;
  if (screen === "friends") return <FriendsScreen searchQ={searchQ} />;
  if (screen === "configs") return <ConfigsScreen />;
  return null;
}

// ─── Markers ──────────────────────────────────────────────────────────────────
interface Marker { id: string; name: string; dim: string; x: number; y: number; z: number; color: string; }
const DIM_COL: Record<string, string> = { Overworld: "#45D39A", Nether: "#FF667C", End: "#756CFF" };

function MarkersScreen({ searchQ }: { searchQ: string }) {
  const [markers, setMarkers] = usePersistentState<Marker[]>("markers", []);
  const [drawer, setDrawer] = useState<Marker | "new" | null>(null);
  const [form, setForm] = useState<Omit<Marker, "id">>({ name: "", dim: "Overworld", x: 0, y: 64, z: 0, color: "#756CFF" });
  const [delId, setDelId] = useState<string | null>(null);

  const visible = markers.filter(m => !searchQ || m.name.toLowerCase().includes(searchQ.toLowerCase()));
  const save = () => {
    if (!form.name.trim()) return;
    if (drawer === "new") setMarkers(m => [...m, { ...form, id: Date.now().toString() }]);
    else setMarkers(m => m.map(mk => mk.id === (drawer as Marker).id ? { ...form, id: mk.id } : mk));
    setDrawer(null);
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-col flex-1 p-3 gap-3 overflow-hidden">
        <div className="flex justify-end">
          <button onClick={() => { setForm({ name: "", dim: "Overworld", x: 0, y: 64, z: 0, color: "#756CFF" }); setDrawer("new"); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#756CFF" }}>
            {Ico.plus} Добавить
          </button>
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto flex-1">
          {visible.length === 0 && <EmptySearch />}
          {visible.map(m => (
            <div key={m.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] group transition-colors duration-100"
              style={{ background: "#141923", border: "1px solid #252D3D" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#39445B")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#252D3D")}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: m.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium" style={{ color: "#F3F5FA" }}>{m.name}</span>
                  <span className="text-[10px] font-medium px-1.5 py-[2px] rounded-[3px]"
                    style={{ background: `${DIM_COL[m.dim] ?? "#252D3D"}18`, color: DIM_COL[m.dim] ?? "#9AA4B6" }}>{m.dim}</span>
                </div>
                <p className="text-[11px]" style={{ color: "#626D80" }}>X {m.x} · Y {m.y} · Z {m.z}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setForm({ name: m.name, dim: m.dim, x: m.x, y: m.y, z: m.z, color: m.color }); setDrawer(m); }}
                  className="w-6 h-6 flex items-center justify-center rounded-[5px] hover:bg-[#191F2B]" style={{ color: "#626D80" }}>{Ico.edit}</button>
                <button onClick={() => setDelId(m.id)}
                  className="w-6 h-6 flex items-center justify-center rounded-[5px] hover:bg-[#191F2B] hover:text-[#FF667C]" style={{ color: "#626D80" }}>{Ico.trash}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {drawer && (
        <div className="w-48 flex flex-col m-3 ml-0 rounded-[10px] overflow-hidden flex-shrink-0" style={{ background: "#141923", border: "1px solid #252D3D" }}>
          <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: "1px solid #252D3D" }}>
            <span className="text-[13px] font-semibold" style={{ color: "#F3F5FA" }}>{drawer === "new" ? "Новая точка" : "Редактировать"}</span>
            <button onClick={() => setDrawer(null)} style={{ color: "#626D80" }}>{Ico.x}</button>
          </div>
          <div className="flex flex-col gap-2.5 p-3 flex-1 overflow-y-auto">
            {([["Название", "name", "text"], ["X", "x", "number"], ["Y", "y", "number"], ["Z", "z", "number"]] as [string, string, string][]).map(([lbl, key, type]) => (
              <div key={key} className="flex flex-col gap-0.5">
                <label className="text-[10px] font-medium" style={{ color: "#9AA4B6" }}>{lbl}</label>
                <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: type === "number" ? +e.target.value : e.target.value }))}
                  className="px-2.5 py-1.5 rounded-[7px] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#756CFF]"
                  style={{ background: "#0C1017", color: "#F3F5FA", border: "1px solid #252D3D" }} />
              </div>
            ))}
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-medium" style={{ color: "#9AA4B6" }}>Измерение</label>
              <Sel options={["Overworld", "Nether", "End"]} value={form.dim} onChange={v => setForm(f => ({ ...f, dim: v }))} />
            </div>
          </div>
          <div className="p-3 flex gap-2" style={{ borderTop: "1px solid #252D3D" }}>
            <button onClick={() => setDrawer(null)} className="flex-1 py-1.5 rounded-[7px] text-[11px] font-medium" style={{ background: "#0C1017", color: "#9AA4B6", border: "1px solid #252D3D" }}>Отмена</button>
            <button onClick={save} className="flex-1 py-1.5 rounded-[7px] text-[11px] font-semibold"
              style={{ background: form.name.trim() ? "#756CFF" : "#252D3D", color: form.name.trim() ? "white" : "#626D80" }}>Сохранить</button>
          </div>
        </div>
      )}
      {delId && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(5,7,10,.7)" }} onClick={() => setDelId(null)}>
          <div className="rounded-[12px] p-5 flex flex-col gap-4" style={{ background: "#141923", border: "1px solid #252D3D", width: 260 }} onClick={e => e.stopPropagation()}>
            <p className="text-[14px] font-semibold" style={{ color: "#F3F5FA" }}>Удалить точку?</p>
            <div className="flex gap-2">
              <button onClick={() => setDelId(null)} className="flex-1 py-2 rounded-[8px] text-[12px] font-medium" style={{ background: "#0C1017", color: "#9AA4B6", border: "1px solid #252D3D" }}>Отмена</button>
              <button onClick={() => { setMarkers(m => m.filter(mk => mk.id !== delId)); setDelId(null); }}
                className="flex-1 py-2 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: "#FF667C" }}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Friends ──────────────────────────────────────────────────────────────────
interface Friend extends StoredFriend { name: string; alias?: string; note?: string; online: boolean; fav: boolean; }

function FriendsScreen({ searchQ }: { searchQ: string }) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [dupErr, setDupErr] = useState(false);
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);

  useEffect(() => {
    void window.vela.state.get().then(state => setFriends((state.friends ?? []).map(friend => ({
      ...friend,
      name: friend.username,
      online: false,
      fav: Boolean((friend as StoredFriend & { fav?: boolean }).fav),
    })))).catch(cause => setAddError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  const commit = (next: Friend[]) => {
    setFriends(next);
    void window.vela.state.saveFriends(next).catch(cause => setAddError(cause instanceof Error ? cause.message : String(cause)));
  };

  const visible = friends.filter(f => !searchQ || f.name.toLowerCase().includes(searchQ.toLowerCase()));

  const addFriend = async () => {
    const n = addName.trim(); if (!n) return;
    if (friends.some(f => f.name.toLowerCase() === n.toLowerCase())) { setDupErr(true); return; }
    setAdding(true); setAddError("");
    try {
      const profile = await window.vela.friends.resolve(n);
      const next = [...friends, {
        id: profile.uuid,
        username: profile.username,
        uuid: profile.uuid,
        addedAt: Date.now(),
        name: profile.username,
        online: false,
        fav: false,
      }];
      commit(next);
      setAddName(""); setAddOpen(false);
    } catch (cause) {
      setAddError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 p-3 gap-3 overflow-hidden">
      <div className="flex justify-end">
        <button onClick={() => { setAddOpen(true); setDupErr(false); setAddName(""); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "#756CFF" }}>
          {Ico.plus} Добавить
        </button>
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto flex-1">
        {visible.length === 0 && <EmptySearch />}
        {visible.map(f => (
          <div key={f.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] group transition-colors duration-100"
            style={{ background: "#141923", border: "1px solid #252D3D" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#39445B")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#252D3D")}>
            <div className="relative flex-shrink-0">
              <img
                src={`https://mc-heads.net/avatar/${encodeURIComponent(f.name)}/64`}
                alt={`${f.name} skin`}
                loading="lazy"
                className="w-8 h-8 rounded-[5px] object-cover"
                style={{ imageRendering: "pixelated", background: "#0C1017" }}
                onError={event => {
                  const image = event.currentTarget;
                  if (!image.src.includes("/Steve/")) image.src = "https://mc-heads.net/avatar/Steve/64";
                }}
              />
              <span className="absolute -bottom-[1px] -right-[1px] w-2.5 h-2.5 rounded-full border-2" style={{ background: f.online ? "#45D39A" : "#252D3D", borderColor: "#141923" }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><span className="text-[13px] font-medium" style={{ color: "#F3F5FA" }}>{f.name}</span>{f.alias && <span className="text-[11px]" style={{ color: "#626D80" }}>"{f.alias}"</span>}</div>
              {f.note && <p className="text-[11px]" style={{ color: "#626D80" }}>{f.note}</p>}
            </div>
            <span className="text-[10px] font-medium" style={{ color: f.online ? "#45D39A" : "#626D80" }}>{f.online ? "В сети" : "Не в сети"}</span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => commit(friends.map(friend => friend.id === f.id ? { ...friend, fav: !friend.fav } : friend))}
                className="w-6 h-6 flex items-center justify-center rounded-[5px] hover:bg-[#191F2B]"
                style={{ color: f.fav ? "#F7BC62" : "#626D80" }}>{Ico.star}</button>
              <button onClick={() => setDelId(f.id)} className="w-6 h-6 flex items-center justify-center rounded-[5px] hover:bg-[#191F2B] hover:text-[#FF667C]" style={{ color: "#626D80" }}>{Ico.trash}</button>
            </div>
          </div>
        ))}
      </div>
      {addOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(5,7,10,.7)" }} onClick={() => setAddOpen(false)}>
          <div className="rounded-[12px] p-5 flex flex-col gap-4" style={{ background: "#141923", border: "1px solid #252D3D", width: 280 }} onClick={e => e.stopPropagation()}>
            <p className="text-[14px] font-semibold" style={{ color: "#F3F5FA" }}>Добавить игрока</p>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: "#9AA4B6" }}>Имя в Minecraft</label>
              <input value={addName} onChange={e => { setAddName(e.target.value); setDupErr(false); setAddError(""); }}
                onKeyDown={e => e.key === "Enter" && void addFriend()}
                placeholder="Никнейм" className="px-3 py-2 rounded-[8px] text-[12px] placeholder:text-[#626D80] focus:outline-none focus:ring-1 focus:ring-[#756CFF]"
                style={{ background: "#0C1017", color: "#F3F5FA", border: `1px solid ${dupErr ? "#FF667C" : "#252D3D"}` }} />
              {dupErr && <p className="text-[11px]" style={{ color: "#FF667C" }}>Уже в списке.</p>}
              {addError && <p className="text-[11px]" style={{ color: "#FF667C" }}>{addError}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAddOpen(false)} className="flex-1 py-2 rounded-[8px] text-[12px] font-medium" style={{ background: "#0C1017", color: "#9AA4B6", border: "1px solid #252D3D" }}>Отмена</button>
              <button disabled={adding || !addName.trim()} onClick={() => void addFriend()} className="flex-1 py-2 rounded-[8px] text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: "#756CFF" }}>{adding ? "Проверка…" : "Добавить"}</button>
            </div>
          </div>
        </div>
      )}
      {delId && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(5,7,10,.7)" }} onClick={() => setDelId(null)}>
          <div className="rounded-[12px] p-5 flex flex-col gap-4" style={{ background: "#141923", border: "1px solid #252D3D", width: 260 }} onClick={e => e.stopPropagation()}>
            <p className="text-[14px] font-semibold" style={{ color: "#F3F5FA" }}>Удалить из списка?</p>
            <div className="flex gap-2">
              <button onClick={() => setDelId(null)} className="flex-1 py-2 rounded-[8px] text-[12px] font-medium" style={{ background: "#0C1017", color: "#9AA4B6", border: "1px solid #252D3D" }}>Отмена</button>
              <button onClick={() => { commit(friends.filter(friend => friend.id !== delId)); setDelId(null); }}
                className="flex-1 py-2 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: "#FF667C" }}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Configs ──────────────────────────────────────────────────────────────────
interface Config { id: string; name: string; mods: number; updated: string; snapshot?: Record<string, string>; }

function ConfigsScreen() {
  const [configs, setConfigs] = usePersistentState<Config[]>("configs.list", [
    { id: "default", name: "Default", mods: 0, updated: "только что" },
  ]);
  const [active, setActive] = usePersistentState("configs.active", "default");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const capture = (): Record<string, string> => {
    const snapshot: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("vela:") && !key.startsWith("vela:configs.")) snapshot[key] = localStorage.getItem(key) ?? "";
    }
    return snapshot;
  };

  const enabledCount = (snapshot: Record<string, string>) => {
    try { return Object.values(JSON.parse(snapshot["vela:modules.enabled"] ?? "{}") as Record<string, boolean>).filter(Boolean).length; }
    catch { return 0; }
  };

  const create = () => {
    const n = newName.trim(); if (!n) return;
    const id = Date.now().toString();
    const snapshot = capture();
    setConfigs(c => [...c, { id, name: n, mods: enabledCount(snapshot), updated: "только что", snapshot }]);
    setActive(id); setNewName(""); setCreateOpen(false);
  };

  const loadConfig = (config: Config) => {
    if (!config.snapshot) return;
    Object.entries(config.snapshot).forEach(([key, value]) => localStorage.setItem(key, value));
    setActive(config.id);
    window.location.reload();
  };

  const duplicateConfig = (config: Config) => {
    const copy = { ...config, id: Date.now().toString(), name: `${config.name} Copy`, updated: "только что", snapshot: { ...(config.snapshot ?? capture()) } };
    setConfigs(current => [...current, copy]);
  };

  const importConfig = async () => {
    const imported = await window.vela.app.importJson<Config>();
    if (!imported || !imported.snapshot || typeof imported.name !== "string") return;
    const next = { ...imported, id: Date.now().toString(), updated: "импортирован", mods: enabledCount(imported.snapshot) };
    setConfigs(current => [...current, next]);
  };

  const handleAction = async (label: string, config: Config) => {
    if (label === "Загрузить") loadConfig(config);
    if (label === "Дублировать") duplicateConfig(config);
    if (label === "Экспорт") await window.vela.app.exportJson(config.name, { ...config, snapshot: config.snapshot ?? capture() });
    if (label === "Удалить" && config.id !== "default") {
      setConfigs(current => current.filter(item => item.id !== config.id));
      if (active === config.id) setActive("default");
    }
  };

  return (
    <div className="flex flex-col flex-1 p-3 gap-2.5 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "#626D80" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#45D39A" }} />
          Сохранено только что
        </div>
        <div className="flex gap-2">
          <button onClick={() => void importConfig()} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] text-[11px] font-medium transition-colors hover:border-[#39445B]" style={{ background: "#141923", color: "#9AA4B6", border: "1px solid #252D3D" }}>{Ico.upload} Импорт</button>
          <button onClick={() => { setNewName(""); setCreateOpen(true); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] text-[11px] font-semibold text-white"
            style={{ background: "#756CFF" }}>{Ico.plus} Профиль</button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto flex-1">
        {configs.map(c => (
          <div key={c.id}
            className="flex items-center gap-3 px-3 cursor-pointer transition-colors duration-100 rounded-[8px]"
            style={{ height: 52, background: active === c.id ? "#191F2B" : "#141923", border: `1px solid ${active === c.id ? "#39445B" : "#252D3D"}` }}
            onClick={() => setActive(c.id)}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium" style={{ color: "#F3F5FA" }}>{c.name}</span>
                {active === c.id && <span className="text-[10px] font-medium" style={{ color: "#45D39A" }}>Активен</span>}
              </div>
              <p className="text-[11px]" style={{ color: "#626D80" }}>{c.mods} модулей · {c.updated}</p>
            </div>
            <div className="flex gap-1">
              {[{ lbl: "Загрузить", ico: Ico.check }, { lbl: "Дублировать", ico: Ico.copy }, { lbl: "Экспорт", ico: Ico.download }, { lbl: "Удалить", ico: Ico.trash, danger: true }].map(a => (
                <button key={a.lbl} onClick={e => { e.stopPropagation(); void handleAction(a.lbl, c); }}
                  title={a.lbl} className="w-6 h-6 flex items-center justify-center rounded-[5px] hover:bg-[#1A2030]"
                  style={{ color: a.danger ? "#FF667C" : "#626D80" }}>
                  {a.ico}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {createOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(5,7,10,.7)" }} onClick={() => setCreateOpen(false)}>
          <div className="rounded-[12px] p-5 flex flex-col gap-4" style={{ background: "#141923", border: "1px solid #252D3D", width: 280 }} onClick={e => e.stopPropagation()}>
            <p className="text-[14px] font-semibold" style={{ color: "#F3F5FA" }}>Новый профиль</p>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && create()}
              placeholder="Например, PvP Setup" className="px-3 py-2 rounded-[8px] text-[12px] placeholder:text-[#626D80] focus:outline-none focus:ring-1 focus:ring-[#756CFF]"
              style={{ background: "#0C1017", color: "#F3F5FA", border: "1px solid #252D3D" }} />
            <div className="flex gap-2">
              <button onClick={() => setCreateOpen(false)} className="flex-1 py-2 rounded-[8px] text-[12px] font-medium" style={{ background: "#0C1017", color: "#9AA4B6", border: "1px solid #252D3D" }}>Отмена</button>
              <button onClick={create} className="flex-1 py-2 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: "#756CFF" }}>Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Client Window ────────────────────────────────────────────────────────────
const NAV: { id: Screen; label: string; icon: ReactNode }[] = [
  { id: "visuals", label: "Visuals", icon: NavIco.visuals },
  { id: "hud", label: "HUD", icon: NavIco.hud },
  { id: "utilities", label: "Utilities", icon: NavIco.utilities },
  { id: "markers", label: "Markers", icon: NavIco.markers },
  { id: "friends", label: "Friends", icon: NavIco.friends },
  { id: "configs", label: "Configs", icon: NavIco.configs },
];

const META: Record<Screen, { title: string; desc: string }> = {
  visuals: { title: "Visuals", desc: "Рендеринг и визуальные эффекты" },
  hud: { title: "HUD", desc: "Элементы экранного интерфейса" },
  utilities: { title: "Utilities", desc: "Вспомогательные инструменты" },
  markers: { title: "Markers", desc: "Сохранённые точки мира" },
  friends: { title: "Friends", desc: "Список игроков и заметки" },
  configs: { title: "Configs", desc: "Управление профилями" },
};

function NavItem({ item, active, onClick }: { item: typeof NAV[0]; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center gap-2.5 w-full rounded-[7px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#756CFF]"
      style={{
        padding: "7px 10px",
        background: active ? "#141923" : hover ? "#0F1319" : "transparent",
        transition: "background 120ms cubic-bezier(.2,.8,.2,1), transform 120ms cubic-bezier(.2,.8,.2,1)",
        transform: !active && hover ? "translateX(2px)" : "none",
      }}>
      {/* Active accent line */}
      {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width: 2, height: "44%", background: "#55CFFF" }} />}
      {/* Hover accent line (not active) */}
      {!active && hover && <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full" style={{ width: 2, height: "28%", background: "#55CFFF", opacity: 0.5, transition: "height 120ms, opacity 120ms" }} />}
      <span style={{ color: active ? "#918BFF" : hover ? "#9AA4B6" : "#626D80", transition: "color 120ms", flexShrink: 0 }}>
        {item.icon}
      </span>
      <span style={{ fontSize: 13, fontWeight: active ? 500 : 400, color: active ? "#F3F5FA" : hover ? "#C4CADB" : "#626D80", transition: "color 120ms" }}>
        {item.label}
      </span>
    </button>
  );
}

function VelaClientWindow({ onBack, initialSettingsOpen = false }: { onBack: () => void; initialSettingsOpen?: boolean }) {
  const [screen, setScreen] = useState<Screen>("visuals");
  const [fade, setFade] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen);
  const [accentColor, setAccentColor] = usePersistentState("settings.accent", "#756CFF");
  const [recentColors, setRecentColors] = usePersistentState<string[]>("settings.recentColors", []);
  const searchRef = useRef<HTMLInputElement>(null);

  const go = (s: Screen) => {
    if (s === screen) return;
    setFade(true);
    setTimeout(() => { setScreen(s); setFade(false); }, 80);
  };

  const onUsedColor = useCallback((c: string) => {
    setRecentColors(r => [c, ...r.filter(x => x !== c)].slice(0, 6));
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const meta = META[screen];

  return (
    <div className="relative flex flex-shrink-0" style={{
      width: "min(820px, calc(100vw - 64px))",
      height: "min(500px, calc(100vh - 64px))",
      background: "#10141C",
      borderRadius: 14,
      boxShadow: "0 20px 60px rgba(0,0,0,.55), 0 0 0 1px #252D3D",
      overflow: "hidden",
    }}>
      {/* Sidebar */}
      <div className="flex flex-col flex-shrink-0" style={{ width: 164, background: "#0B0E14", borderRight: "1px solid #1A2030" }}>
        <div className="flex flex-col gap-0.5 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #1A2030" }}>
          <div className="flex items-center gap-2.5">
            <LogoAsset size={24} />
            <span style={{ fontSize: 15, fontWeight: 600, color: "#F3F5FA", letterSpacing: "-0.01em" }}>Vela</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 500, color: "#626D80", marginLeft: 32 }}>Client 26.2</span>
        </div>

        <nav className="flex flex-col gap-0.5 p-2 flex-1">
          {NAV.map(item => (
            <NavItem key={item.id} item={item} active={screen === item.id} onClick={() => go(item.id)} />
          ))}
        </nav>

        <div className="px-4 py-3" style={{ borderTop: "1px solid #1A2030" }}>
          <span style={{ fontSize: 10, color: "#626D80" }}>v0.1.0-alpha</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 min-w-0 relative">
        <div className="flex items-center gap-2 px-4 flex-shrink-0" style={{ height: 56, borderBottom: "1px solid #1A2030" }}>
          <div className="flex-1 min-w-0">
            <h1 style={{ fontSize: 19, fontWeight: 600, color: "#F3F5FA", lineHeight: 1 }}>{meta.title}</h1>
            <p style={{ fontSize: 12, color: "#626D80", marginTop: 2 }}>{meta.desc}</p>
          </div>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#626D80" }}>{Ico.search}</span>
            <input ref={searchRef} value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Поиск…"
              className="pl-7 pr-10 py-1.5 rounded-[8px] text-[12px] placeholder:text-[#626D80] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#756CFF] transition-colors"
              style={{ width: 168, background: "#141923", color: "#F3F5FA", border: "1px solid #252D3D" }} />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-medium pointer-events-none" style={{ color: "#626D80" }}>Ctrl K</span>
          </div>
          <button onClick={() => setSettingsOpen(!settingsOpen)} aria-label="Настройки клиента"
            className="w-8 h-8 flex items-center justify-center rounded-[7px] transition-colors hover:bg-[#141923] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#756CFF]"
            style={{ color: settingsOpen ? "#756CFF" : "#626D80", background: settingsOpen ? "rgba(117,108,255,.1)" : "transparent" }}>
            {Ico.settings}
          </button>
        </div>

        <div className={`flex flex-col flex-1 overflow-hidden transition-opacity duration-75 ${fade ? "opacity-0" : "opacity-100"}`}>
          <ScreenContent screen={screen} searchQ={searchQ} recentColors={recentColors} onUsedColor={onUsedColor} />
        </div>

        {settingsOpen && (
          <SettingsPanel onClose={() => setSettingsOpen(false)} accentColor={accentColor} onAccentChange={setAccentColor} recentColors={recentColors} onUsed={onUsedColor} />
        )}
      </div>
    </div>
  );
}

// ─── Account Manager ──────────────────────────────────────────────────────────
type AcctFlow = "idle" | "loading" | "waiting" | "success" | "cancelled" | "expired" | "error";

function LegacyAccountManager({ onBack }: { onBack: () => void }) {
  const [accounts, setAccounts] = useState([
    { id: "1", name: "VelaUser", uuid: "a3f2…b91c", lastUsed: "Сейчас" },
    { id: "2", name: "AltAccount", uuid: "7d1e…c234", lastUsed: "3 дня назад" },
  ]);
  const [active, setActive] = useState("1");
  const [flow, setFlow] = useState<AcctFlow>("idle");
  const [switchWarn, setSwitchWarn] = useState<string | null>(null);

  const MinecraftHead = ({ name, uuid, size = 36 }: { name: string; uuid?: string; size: number }) => (
    <img
      src={`https://mc-heads.net/avatar/${encodeURIComponent(uuid || name)}/64`}
      alt={`${name} skin`}
      className="rounded-[4px] flex-shrink-0 object-cover"
      style={{ width: size, height: size, imageRendering: "pixelated", background: "#0C1017" }}
      onError={event => {
        const image = event.currentTarget;
        if (!image.src.includes("/Steve/")) image.src = "https://mc-heads.net/avatar/Steve/64";
      }}
    />
  );

  const startFlow = () => {
    setFlow("loading");
    setTimeout(() => setFlow("waiting"), 900);
  };

  const hasAccounts = accounts.length > 0;

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="flex flex-col rounded-[14px] overflow-hidden" style={{
        width: "min(620px, calc(100vw - 64px))",
        height: "min(430px, calc(100vh - 64px))",
        background: "#10141C",
        boxShadow: "0 20px 60px rgba(0,0,0,.55), 0 0 0 1px #252D3D",
      }}>
        <div className="flex items-center gap-3 px-4 flex-shrink-0" style={{ height: 52, borderBottom: "1px solid #1A2030" }}>
          <button onClick={onBack} className="w-6 h-6 flex items-center justify-center rounded-[5px] hover:bg-[#141923] transition-colors" style={{ color: "#626D80" }}>{Ico.back}</button>
          <h1 style={{ fontSize: 14, fontWeight: 600, color: "#F3F5FA" }}>Аккаунты</h1>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Account list or empty state */}
          <div className="flex flex-col flex-1 p-3 gap-2 overflow-y-auto">
            {!hasAccounts ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-8">
                <div className="w-12 h-12 rounded-[10px]" style={{ background: "#141923" }} />
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: "#F3F5FA" }}>Подключите Microsoft-аккаунт</p>
                  <p className="text-[12px] mt-1.5" style={{ color: "#626D80", lineHeight: 1.6 }}>Войдите через Microsoft, чтобы начать игру. Пароли и данные сессии хранятся в системном менеджере учётных данных.</p>
                </div>
                <button onClick={startFlow}
                  className="px-5 py-2.5 rounded-[9px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: "#756CFF" }}>Войти через Microsoft</button>
                <button className="text-[12px] transition-colors hover:opacity-80" style={{ color: "#626D80", textDecoration: "underline", textUnderlineOffset: 3 }}>Создать Microsoft-аккаунт</button>
              </div>
            ) : (
              <>
                {accounts.map(a => (
                  <div key={a.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-[9px] cursor-pointer transition-colors group"
                    style={{ background: "#141923", border: `1px solid ${active === a.id ? "#756CFF" : "#252D3D"}` }}
                    onClick={() => {
                      if (active !== a.id) setSwitchWarn(a.id);
                      else setActive(a.id);
                    }}>
                    <MinecraftHead name={a.name} uuid={a.uuid} size={36} />
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 13, fontWeight: 500, color: "#F3F5FA" }}>{a.name}</p>
                      <p style={{ fontSize: 11, color: "#626D80" }}>UUID {a.uuid} · {a.lastUsed}</p>
                    </div>
                    {active === a.id
                      ? <span style={{ fontSize: 11, fontWeight: 500, color: "#45D39A" }}>Активен</span>
                      : <button onClick={e => { e.stopPropagation(); setSwitchWarn(a.id); }}
                          className="px-2.5 py-1 rounded-[6px] text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-all"
                          style={{ background: "#0C1017", color: "#9AA4B6", border: "1px solid #252D3D" }}>Активировать</button>}
                    {active !== a.id && (
                      <button onClick={e => { e.stopPropagation(); setAccounts(ac => ac.filter(x => x.id !== a.id)); }}
                        className="w-6 h-6 flex items-center justify-center rounded-[5px] opacity-0 group-hover:opacity-100 transition-all hover:text-[#FF667C]"
                        style={{ color: "#626D80" }}>{Ico.trash}</button>
                    )}
                  </div>
                ))}
                <button onClick={startFlow}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-[9px] mt-auto text-[12px] font-semibold transition-colors hover:border-[#756CFF] hover:text-[#756CFF]"
                  style={{ background: "#141923", color: "#9AA4B6", border: "1px solid #252D3D" }}>
                  {Ico.plus} Войти через Microsoft
                </button>
              </>
            )}
          </div>

          {/* Flow panel */}
          <div className="w-52 flex flex-col p-4 flex-shrink-0" style={{ borderLeft: "1px solid #1A2030" }}>
            {flow === "idle" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
                <p style={{ fontSize: 11, color: "#626D80", lineHeight: 1.6 }}>Управление Microsoft-аккаунтами. Для входа откроется системный браузер.</p>
              </div>
            )}
            {flow === "loading" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-[#756CFF] border-t-transparent animate-spin" />
                <p style={{ fontSize: 12, color: "#9AA4B6" }}>Открываем браузер…</p>
              </div>
            )}
            {flow === "waiting" && (
              <div className="flex flex-col flex-1 gap-3 justify-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-[#756CFF] border-t-transparent animate-spin flex-shrink-0" />
                  <p style={{ fontSize: 12, color: "#9AA4B6" }}>Ожидание входа в браузере…</p>
                </div>
                <p style={{ fontSize: 11, color: "#626D80", lineHeight: 1.5 }}>Завершите вход в открывшемся окне Microsoft.</p>
                <div className="flex gap-1.5 mt-1">
                  <button onClick={() => setFlow("cancelled")} className="flex-1 py-1.5 rounded-[7px] text-[11px] font-medium" style={{ background: "#0C1017", color: "#626D80", border: "1px solid #252D3D" }}>Отмена</button>
                  <button onClick={() => setFlow("success")} className="flex-1 py-1.5 rounded-[7px] text-[11px] font-semibold text-white" style={{ background: "#756CFF" }}>✓ Войдено</button>
                </div>
                <button onClick={() => setFlow("expired")} className="text-[10px] text-center" style={{ color: "#626D80" }}>Симулировать истечение</button>
              </div>
            )}
            {flow === "success" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(69,211,154,.12)", color: "#45D39A" }}>{Ico.check}</div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#F3F5FA" }}>Аккаунт добавлен</p>
                <button onClick={() => { setAccounts(a => [...a, { id: Date.now().toString(), name: "NewPlayer", uuid: "f9a1…3b7e", lastUsed: "Сейчас" }]); setFlow("idle"); }}
                  className="w-full py-2 rounded-[7px] text-[12px] font-semibold text-white" style={{ background: "#756CFF" }}>Готово</button>
              </div>
            )}
            {(flow === "cancelled" || flow === "expired") && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
                <p style={{ fontSize: 13, fontWeight: 600, color: "#F3F5FA" }}>{flow === "expired" ? "Сессия истекла" : "Вход отменён"}</p>
                <p style={{ fontSize: 11, color: "#626D80" }}>Попробуйте снова.</p>
                <button onClick={startFlow} className="w-full py-2 rounded-[7px] text-[12px] font-semibold text-white" style={{ background: "#756CFF" }}>Повторить</button>
              </div>
            )}
            {flow === "error" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
                <p style={{ fontSize: 13, fontWeight: 600, color: "#FF667C" }}>Ошибка сети</p>
                <button onClick={startFlow} className="w-full py-2 rounded-[7px] text-[12px] font-semibold text-white" style={{ background: "#756CFF" }}>Повторить</button>
              </div>
            )}
            <p className="mt-3 text-center" style={{ fontSize: 10, color: "#626D80", lineHeight: 1.5 }}>Токены хранятся в менеджере учётных данных ОС.</p>
          </div>
        </div>
      </div>

      {/* Account switch warning */}
      {switchWarn && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(5,7,10,.7)" }} onClick={() => setSwitchWarn(null)}>
          <div className="rounded-[12px] p-5 flex flex-col gap-4" style={{ background: "#141923", border: "1px solid #252D3D", width: 300 }} onClick={e => e.stopPropagation()}>
            <p className="text-[14px] font-semibold" style={{ color: "#F3F5FA" }}>Смена аккаунта</p>
            <p style={{ fontSize: 12, color: "#9AA4B6", lineHeight: 1.6 }}>Для смены аккаунта необходимо отключиться от текущего сервера. Продолжить?</p>
            <div className="flex gap-2">
              <button onClick={() => setSwitchWarn(null)} className="flex-1 py-2 rounded-[8px] text-[12px] font-medium" style={{ background: "#0C1017", color: "#9AA4B6", border: "1px solid #252D3D" }}>Отмена</button>
              <button onClick={() => { setActive(switchWarn); setSwitchWarn(null); }}
                className="flex-1 py-2 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: "#756CFF" }}>Сменить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type AccountProvider = "microsoft" | "offline" | "ely" | "littleskin";

function ProviderMark({ provider }: { provider: AccountProvider }) {
  if (provider === "microsoft") {
    return (
      <span className="grid grid-cols-2 gap-[2px] w-4 h-4 flex-shrink-0">
        <i style={{ background: "#f35325" }} /><i style={{ background: "#81bc06" }} />
        <i style={{ background: "#05a6f0" }} /><i style={{ background: "#ffba08" }} />
      </span>
    );
  }
  if (provider === "ely")
    return <span className="w-4 h-4 grid place-items-center rounded-[4px] text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg,#48C78E,#238A63)" }}>E</span>;
  if (provider === "littleskin")
    return <span className="w-4 h-4 grid place-items-center rounded-[4px] text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg,#B778FF,#6C63FF)" }}>L</span>;
  return <span className="w-4 h-4 flex items-center justify-center" style={{ color: "#9AA4B6" }}>{NavIco.friends}</span>;
}

function MinecraftAvatar({ account, size = 38 }: { account: StoredAccount; size?: number }) {
  const [texture, setTexture] = useState<string | null>(account.skinDataUrl ?? null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const identity = account.type === "offline" ? account.username : account.uuid || account.username;

  useEffect(() => {
    let alive = true;
    if (!texture && account.type !== "offline") {
      void window.vela.appearance.get(account).then(appearance => {
        if (alive && appearance.skinDataUrl) setTexture(appearance.skinDataUrl);
      }).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [account.id, account.type, account.accessToken, texture]);

  useEffect(() => {
    if (!texture || !canvas.current) return;
    const image = new Image();
    image.onload = () => {
      const context = canvas.current?.getContext("2d");
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, size, size);
      context.drawImage(image, 8, 8, 8, 8, 0, 0, size, size);
      context.drawImage(image, 40, 8, 8, 8, 0, 0, size, size);
    };
    image.src = texture;
  }, [texture, size]);

  if (texture) {
    return <canvas ref={canvas} width={size} height={size} aria-label={`${account.username} skin`} className="rounded-[5px] flex-shrink-0" style={{ width: size, height: size, imageRendering: "pixelated", background: "#0C1017" }} />;
  }
  return (
    <img
      src={`https://mc-heads.net/avatar/${encodeURIComponent(identity)}/64`}
      alt={`${account.username} skin`}
      className="rounded-[5px] flex-shrink-0 object-cover"
      style={{ width: size, height: size, imageRendering: "pixelated", background: "#0C1017" }}
      onError={event => {
        const image = event.currentTarget;
        if (!image.src.includes("/Steve/")) image.src = "https://mc-heads.net/avatar/Steve/64";
      }}
    />
  );
}

function AccountManager({ onBack }: { onBack: () => void }) {
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [provider, setProvider] = useState<AccountProvider>("microsoft");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Выберите способ входа");
  const [error, setError] = useState("");
  const [offlineName, setOfflineName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [switchWarn, setSwitchWarn] = useState<string | null>(null);

  const save = useCallback(async (next: StoredAccount[], nextActive: string | null) => {
    setAccounts(next);
    setActiveId(nextActive);
    await window.vela.state.saveAccounts(next, nextActive);
  }, []);

  useEffect(() => {
    void window.vela.state.get().then(state => {
      setAccounts(state.accounts || []);
      setActiveId(state.activeAccountId ?? state.accounts?.[0]?.id ?? null);
    }).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  useEffect(() => {
    return window.vela.auth.onStatus((event: MsAuthStatus) => {
      if (event.state === "waiting") setStatus(event.message || "Ожидание входа в браузере…");
      if (event.state === "cancelled") {
        setBusy(false);
        setStatus("Вход отменён");
      }
      if (event.state === "error") {
        setBusy(false);
        setError(event.message || "Не удалось войти через Microsoft.");
      }
      if (event.state === "success" && event.account) {
        setBusy(false);
        setStatus("Microsoft-аккаунт подключён");
        setAccounts(current => {
          const next = current.some(item => item.id === event.account!.id)
            ? current.map(item => item.id === event.account!.id ? event.account! : item)
            : [...current, event.account!];
          void window.vela.state.saveAccounts(next, event.account!.id);
          return next;
        });
        setActiveId(event.account.id);
      }
    });
  }, []);

  const beginMicrosoft = async () => {
    setBusy(true); setError(""); setStatus("Открываем системный браузер…");
    try { await window.vela.auth.msStart(); }
    catch (cause) { setBusy(false); setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const addProvider = async () => {
    setBusy(true); setError("");
    try {
      let account: StoredAccount;
      if (provider === "offline") {
        account = await window.vela.auth.createOffline(offlineName);
      } else if (provider === "ely") {
        account = await window.vela.auth.elyLogin({ username: login, password, totp: totp || undefined });
      } else if (provider === "littleskin") {
        account = await window.vela.auth.littleSkinLogin({ username: login, password });
      } else {
        await beginMicrosoft();
        return;
      }
      const next = accounts.some(item => item.id === account.id)
        ? accounts.map(item => item.id === account.id ? account : item)
        : [...accounts, account];
      await save(next, account.id);
      setOfflineName(""); setLogin(""); setPassword(""); setTotp("");
      setStatus(`${account.username} добавлен`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (provider !== "microsoft") setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const next = accounts.filter(item => item.id !== id);
    await save(next, activeId === id ? next[0]?.id ?? null : activeId);
  };

  const activate = async (id: string) => {
    await save(accounts, id);
    setSwitchWarn(null);
  };

  const registrationUrl: Record<AccountProvider, string> = {
    microsoft: "https://signup.live.com/signup?lic=1&mkt=ru-RU",
    offline: "",
    ely: "https://ely.by/register",
    littleskin: "https://littleskin.cn/auth/register",
  };

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="flex flex-col rounded-[14px] overflow-hidden" style={{
        width: "min(720px, calc(100vw - 64px))", height: "min(470px, calc(100vh - 64px))",
        background: "#10141C", boxShadow: "0 20px 60px rgba(0,0,0,.55), 0 0 0 1px #252D3D",
      }}>
        <header className="flex items-center gap-3 px-4 flex-shrink-0" style={{ height: 52, borderBottom: "1px solid #1A2030" }}>
          <button onClick={onBack} className="w-7 h-7 flex items-center justify-center rounded-[6px] hover:bg-[#191F2B] transition-colors" style={{ color: "#9AA4B6" }}>{Ico.back}</button>
          <LogoAsset size={22} />
          <div className="flex-1"><h1 style={{ fontSize: 14, fontWeight: 600, color: "#F3F5FA" }}>Account Manager</h1><p style={{ fontSize: 10, color: "#626D80" }}>Профили Minecraft и игровые сессии</p></div>
        </header>

        <div className="flex flex-1 min-h-0">
          <section className="flex flex-col flex-1 p-3 gap-2 min-w-0" style={{ borderRight: "1px solid #1A2030" }}>
            <div className="flex items-center justify-between px-1 mb-1"><span style={{ fontSize: 11, color: "#9AA4B6" }}>Аккаунты</span><span style={{ fontSize: 10, color: "#626D80" }}>{accounts.length}</span></div>
            <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
              {accounts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                  <LogoAsset size={42} />
                  <div><p style={{ fontSize: 14, fontWeight: 600, color: "#F3F5FA" }}>Добавьте игровой профиль</p><p style={{ fontSize: 11, color: "#626D80", marginTop: 5 }}>Выберите провайдера справа</p></div>
                </div>
              )}
              {accounts.map(account => (
                <div key={account.id} className="group flex items-center gap-3 px-3 py-2.5 rounded-[9px] cursor-pointer transition-all hover:translate-x-[2px]"
                  style={{ background: activeId === account.id ? "rgba(117,108,255,.10)" : "#141923", border: `1px solid ${activeId === account.id ? "#756CFF" : "#252D3D"}` }}
                  onClick={() => activeId === account.id ? undefined : setSwitchWarn(account.id)}>
                  <MinecraftAvatar account={account} />
                  <div className="flex-1 min-w-0"><p className="truncate" style={{ fontSize: 13, fontWeight: 500, color: "#F3F5FA" }}>{account.username}</p><p className="flex items-center gap-1.5" style={{ fontSize: 10, color: "#626D80" }}><ProviderMark provider={account.type} /> {account.type} · {account.uuid.slice(0, 8)}</p></div>
                  {activeId === account.id && <span style={{ fontSize: 10, color: "#45D39A" }}>Активен</span>}
                  <button onClick={event => { event.stopPropagation(); void remove(account.id); }} className="w-7 h-7 flex items-center justify-center rounded-[6px] opacity-0 group-hover:opacity-100 hover:bg-[#201826] hover:text-[#FF667C] transition-all" style={{ color: "#626D80" }}>{Ico.trash}</button>
                </div>
              ))}
            </div>
          </section>

          <aside className="w-[280px] p-4 flex flex-col gap-3 flex-shrink-0">
            <div className="grid grid-cols-4 p-1 gap-1 rounded-[9px]" style={{ background: "#0C1017", border: "1px solid #252D3D" }}>
              {(["microsoft", "offline", "ely", "littleskin"] as AccountProvider[]).map(item => (
                <button key={item} onClick={() => { setProvider(item); setError(""); }} title={item}
                  className="h-8 flex items-center justify-center rounded-[6px] transition-colors"
                  style={{ background: provider === item ? "#191F2B" : "transparent", color: provider === item ? "#F3F5FA" : "#626D80", border: provider === item ? "1px solid #39445B" : "1px solid transparent" }}>
                  <ProviderMark provider={item} />
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2"><ProviderMark provider={provider} /><div><p style={{ fontSize: 13, fontWeight: 600, color: "#F3F5FA" }}>{provider === "microsoft" ? "Microsoft" : provider === "offline" ? "Offline" : provider === "ely" ? "Ely.by" : "LittleSkin"}</p><p style={{ fontSize: 10, color: "#626D80" }}>{provider === "offline" ? "Локальный профиль" : "Авторизация аккаунта"}</p></div></div>

            {provider === "microsoft" ? (
              <div className="flex flex-col gap-3">
                <p style={{ fontSize: 11, lineHeight: 1.55, color: "#9AA4B6" }}>Вход откроется в системном браузере. Пароль не передаётся Vela Launcher.</p>
                <button disabled={busy} onClick={beginMicrosoft} className="py-2.5 rounded-[8px] text-[12px] font-semibold text-white disabled:opacity-50 hover:brightness-110 transition-all" style={{ background: "#756CFF" }}>{busy ? "Ожидание Microsoft…" : "Войти через Microsoft"}</button>
              </div>
            ) : provider === "offline" ? (
              <label className="flex flex-col gap-1"><span style={{ fontSize: 10, color: "#9AA4B6" }}>Никнейм Minecraft</span><input value={offlineName} onChange={event => setOfflineName(event.target.value)} maxLength={16} placeholder="Steve" className="px-3 py-2 rounded-[8px] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#756CFF]" style={{ background: "#0C1017", color: "#F3F5FA", border: "1px solid #252D3D" }} /></label>
            ) : (
              <div className="flex flex-col gap-2">
                <input value={login} onChange={event => setLogin(event.target.value)} placeholder={provider === "ely" ? "Логин или email" : "Email"} autoComplete="username" className="px-3 py-2 rounded-[8px] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#756CFF]" style={{ background: "#0C1017", color: "#F3F5FA", border: "1px solid #252D3D" }} />
                <input value={password} onChange={event => setPassword(event.target.value)} placeholder="Пароль" type="password" autoComplete="current-password" className="px-3 py-2 rounded-[8px] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#756CFF]" style={{ background: "#0C1017", color: "#F3F5FA", border: "1px solid #252D3D" }} />
                {provider === "ely" && <input value={totp} onChange={event => setTotp(event.target.value)} placeholder="Код 2FA, если включён" inputMode="numeric" className="px-3 py-2 rounded-[8px] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#756CFF]" style={{ background: "#0C1017", color: "#F3F5FA", border: "1px solid #252D3D" }} />}
              </div>
            )}

            {provider !== "microsoft" && <button disabled={busy || (provider === "offline" ? !offlineName.trim() : !login.trim() || !password)} onClick={addProvider} className="py-2.5 rounded-[8px] text-[12px] font-semibold text-white disabled:opacity-35 hover:brightness-110 transition-all" style={{ background: "#756CFF" }}>{busy ? "Подключение…" : "Добавить аккаунт"}</button>}
            {registrationUrl[provider] && <button onClick={() => void window.vela.app.openExternal(registrationUrl[provider])} className="text-[10px] text-left hover:underline" style={{ color: "#918BFF" }}>Создать аккаунт</button>}
            <div className="mt-auto min-h-10"><p style={{ fontSize: 10, lineHeight: 1.45, color: error ? "#FF667C" : "#626D80" }}>{error || status}</p>{error.includes("Minecraft Services") && <button onClick={() => void window.vela.app.openExternal("https://aka.ms/AppRegInfo")} className="mt-1.5 text-[10px] hover:underline" style={{ color: "#918BFF" }}>Открыть регистрацию приложения</button>}{provider === "offline" && <p style={{ fontSize: 9, lineHeight: 1.4, color: "#626D80", marginTop: 5 }}>Online-mode серверы требуют лицензионный аккаунт.</p>}</div>
          </aside>
        </div>
      </div>

      {switchWarn && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(5,7,10,.72)" }} onClick={() => setSwitchWarn(null)}>
          <div className="rounded-[12px] p-5 flex flex-col gap-4" style={{ background: "#141923", border: "1px solid #252D3D", width: 300 }} onClick={event => event.stopPropagation()}>
            <p className="text-[14px] font-semibold" style={{ color: "#F3F5FA" }}>Сменить активный аккаунт?</p>
            <p style={{ fontSize: 12, color: "#9AA4B6", lineHeight: 1.55 }}>Игровая сессия будет изменена при следующем запуске Minecraft.</p>
            <div className="flex gap-2"><button onClick={() => setSwitchWarn(null)} className="flex-1 py-2 rounded-[8px] text-[12px]" style={{ background: "#0C1017", color: "#9AA4B6", border: "1px solid #252D3D" }}>Отмена</button><button onClick={() => void activate(switchWarn)} className="flex-1 py-2 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: "#756CFF" }}>Сменить</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────
function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Загрузка ресурсов…");
  const [fading, setFading] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    const steps = [
      { pct: 35, label: "Загрузка ресурсов…", delay: 500 },
      { pct: 72, label: "Инициализация модулей…", delay: 1000 },
      { pct: 100, label: "Готово", delay: 1600 },
    ];
    steps.forEach(({ pct, label: l, delay }) => {
      setTimeout(() => {
        setProgress(pct); setLabel(l);
        if (pct === 100 && !done.current) {
          done.current = true;
          const minVisible = Math.max(1400 - delay, 0);
          setTimeout(() => { setFading(true); setTimeout(onDone, 350); }, minVisible);
        }
      }, delay);
    });
  }, [onDone]);

  return (
    <div className={`relative w-full h-full grid place-items-center overflow-hidden transition-opacity duration-[350ms] ${fading ? "opacity-0" : "opacity-100"}`}
      style={{ background: "#080B10" }}>
      <div className="flex flex-col items-center" style={{ animation: "fadeIn 300ms ease-out" }}>
        <LogoAsset size={54} />
        <span className="mt-3" style={{ fontSize: 18, fontWeight: 650, color: "#F3F5FA", letterSpacing: "-0.02em" }}>Vela</span>
        <div className="flex flex-col gap-2 mt-7 items-center">
          <div className="rounded-full overflow-hidden" style={{ width: 200, height: 2, background: "#202736" }}>
            <div className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%`, background: "linear-gradient(90deg,#756CFF,#55CFFF)" }} />
          </div>
          <span className="transition-opacity duration-200" style={{ fontSize: 11, fontWeight: 500, color: "#626D80" }}>{label}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Menu ────────────────────────────────────────────────────────────────
function MainMenuScreen({ onAccounts, onLaunch, onSettings, account, installed }: {
  onAccounts: () => void;
  onLaunch: () => void;
  onSettings: () => void;
  account?: StoredAccount;
  installed: boolean;
}) {
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#090C12" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 76% 38%,rgba(117,108,255,.11),transparent 35%),radial-gradient(circle at 20% 80%,rgba(85,207,255,.045),transparent 30%)" }} />

      <header onMouseDown={event => { if (event.button === 0 && !(event.target as HTMLElement).closest("button")) window.vela.window.drag(); }} className="relative z-10 flex items-center px-8 pr-[126px] select-none" style={{ height: 64, borderBottom: "1px solid #1A2030", background: "rgba(9,12,18,.82)" }}>
        <div className="flex items-center gap-3">
          <LogoAsset size={32} />
          <div><p style={{ fontSize: 16, fontWeight: 650, color: "#F3F5FA", letterSpacing: "-.02em" }}>Vela</p><p style={{ fontSize: 9, color: "#626D80", marginTop: 1 }}>LAUNCHER</p></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button title="Настройки" onClick={onSettings} className="w-9 h-9 grid place-items-center rounded-[9px] transition-colors hover:bg-[#151A24]" style={{ color: "#8490A5", border: "1px solid #202838" }}>{Ico.settings}</button>
          <button onClick={onAccounts} className="h-10 flex items-center gap-2.5 pl-1.5 pr-3 rounded-[10px] text-left transition-colors hover:bg-[#151A24]" style={{ minWidth: 166, border: "1px solid #202838", background: "#10151D" }}>
            {account ? <MinecraftAvatar account={account} size={30} /> : <img src="https://mc-heads.net/avatar/Steve/64" alt="Стандартный скин" style={{ width: 30, height: 30, imageRendering: "pixelated", borderRadius: 6 }} />}
            <span className="min-w-0 flex-1"><span className="block truncate" style={{ fontSize: 11, fontWeight: 600, color: "#E9EDF5" }}>{account?.username ?? "Выбрать аккаунт"}</span><span className="block truncate" style={{ fontSize: 9, color: "#626D80", marginTop: 1 }}>{account ? (account.type === "littleskin" ? "LittleSkin" : account.type === "ely" ? "Ely.by" : account.type === "offline" ? "Offline" : "Microsoft") : "Steve по умолчанию"}</span></span>
            <span style={{ color: "#626D80", transform: "rotate(-90deg)" }}>{Ico.chevron()}</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 grid gap-4 px-8 py-7" style={{ height: "calc(100% - 104px)", gridTemplateColumns: "minmax(0,1fr) minmax(230px,.42fr)" }}>
        <section className="relative overflow-hidden rounded-[16px] p-8 flex flex-col justify-between" style={{ background: "linear-gradient(145deg,#121824 0%,#0E131C 68%,#101527 100%)", border: "1px solid #242C3D", boxShadow: "0 20px 50px rgba(0,0,0,.22)" }}>
          <div className="absolute -right-16 -top-20 w-64 h-64 rounded-full pointer-events-none" style={{ background: "rgba(117,108,255,.08)", filter: "blur(34px)" }} />
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full" style={{ background: installed ? "rgba(69,211,154,.08)" : "rgba(117,108,255,.09)", border: `1px solid ${installed ? "rgba(69,211,154,.2)" : "rgba(117,108,255,.2)"}`, color: installed ? "#55D8A5" : "#9B94FF", fontSize: 9, fontWeight: 600 }}>
              <i className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />{installed ? "СБОРКА ГОТОВА" : "БУДЕТ УСТАНОВЛЕНО АВТОМАТИЧЕСКИ"}
            </div>
            <h1 className="mt-5" style={{ color: "#F5F7FB", fontSize: "clamp(28px,4vw,44px)", lineHeight: 1, fontWeight: 700, letterSpacing: "-.045em" }}>Minecraft 26.2</h1>
            <p className="mt-3 max-w-[440px]" style={{ color: "#7D889C", fontSize: 12, lineHeight: 1.65 }}>Готовая игровая сборка с Fabric и Vela. Лаунчер проверит файлы, установит недостающее и передаст управление Minecraft.</p>
            <div className="flex items-center gap-2 mt-5">
              {["Fabric 0.19.4", "Vela 0.1.0", "x64"].map(label => <span key={label} className="px-2.5 py-1 rounded-[7px]" style={{ color: "#8F9AAF", background: "#0B1017", border: "1px solid #202838", fontSize: 9 }}>{label}</span>)}
            </div>
          </div>
          <div className="flex items-end gap-3 mt-8">
            <button onClick={account ? onLaunch : onAccounts} className="group flex items-center justify-center gap-2 rounded-[11px] text-white transition-all hover:brightness-110 active:scale-[.985]" style={{ width: 210, height: 46, background: "linear-gradient(100deg,#756CFF,#655BE8)", boxShadow: "0 10px 28px rgba(117,108,255,.22)", fontSize: 13, fontWeight: 650 }}>
              <span>{account ? "Играть" : "Выбрать аккаунт"}</span><span className="transition-transform group-hover:translate-x-0.5">{Ico.arrow}</span>
            </button>
            <div className="pb-1"><p style={{ fontSize: 9, color: "#626D80" }}>ПРОФИЛЬ</p><p style={{ fontSize: 10, color: "#9AA4B6", marginTop: 3 }}>{account?.username ?? "Не выбран"}</p></div>
          </div>
        </section>

        <aside className="rounded-[16px] p-5 flex flex-col overflow-hidden" style={{ background: "#0E131B", border: "1px solid #202838" }}>
          <div className="flex items-center justify-between"><p style={{ fontSize: 10, fontWeight: 600, color: "#8994A8" }}>VELA BUILD</p><span className="w-2 h-2 rounded-full" style={{ background: "#45D39A", boxShadow: "0 0 0 4px rgba(69,211,154,.08)" }} /></div>
          <div className="flex-1 grid place-items-center">
            <div className="relative grid place-items-center" style={{ width: 176, height: 176 }}>
              <div className="absolute inset-2 rounded-full" style={{ background: "radial-gradient(circle,rgba(117,108,255,.13),transparent 67%)" }} />
              <LogoAsset size={138} />
            </div>
          </div>
          <button onClick={onAccounts} className="w-full flex items-center justify-between px-3 rounded-[9px] transition-colors hover:bg-[#151B25]" style={{ height: 38, background: "#0A0F16", border: "1px solid #202838", color: "#9AA4B6", fontSize: 10 }}><span>Управление аккаунтами</span>{Ico.arrow}</button>
        </aside>
      </main>

      <footer className="absolute bottom-0 left-0 right-0 h-10 px-8 flex items-center justify-between" style={{ borderTop: "1px solid #171D29", color: "#596477", fontSize: 9 }}>
        <span>Vela Launcher 0.2.0</span><span>Minecraft 26.2 · Fabric</span>
      </footer>
    </div>
  );
}

function WindowControls() {
  return (
    <div className="fixed right-2 top-2 z-[100] flex items-center gap-0.5" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
      <button title="Свернуть" onClick={() => window.vela.window.minimize()} className="w-8 h-7 grid place-items-center rounded-[6px] hover:bg-[#191F2B]" style={{ color: "#626D80" }}><span className="w-2.5 h-px bg-current" /></button>
      <button title="Развернуть" onClick={() => window.vela.window.maximize()} className="w-8 h-7 grid place-items-center rounded-[6px] hover:bg-[#191F2B]" style={{ color: "#626D80" }}><span className="w-2.5 h-2.5 border border-current rounded-[1px]" /></button>
      <button title="Закрыть" onClick={() => window.vela.window.close()} className="w-8 h-7 grid place-items-center rounded-[6px] hover:bg-[#321923] hover:text-[#FF667C]" style={{ color: "#626D80" }}>{Ico.x}</button>
    </div>
  );
}

function LaunchOverlay({ progress, status, error, onCancel, onClose }: {
  progress: InstallProgress | null;
  status: LaunchStatus | null;
  error: string;
  onCancel: () => void;
  onClose: () => void;
}) {
  const value = Math.round((progress?.progress ?? (status?.state === "running" ? 1 : 0)) * 100);
  const finished = status?.state === "running" || status?.state === "exited";
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center" style={{ background: "rgba(5,7,10,.76)", backdropFilter: "blur(8px)" }}>
      <div className="w-[360px] rounded-[14px] p-5 flex flex-col gap-4" style={{ background: "#10141C", border: "1px solid #252D3D", boxShadow: "0 24px 80px rgba(0,0,0,.55)" }}>
        <div className="flex items-center gap-3"><LogoAsset size={28} /><div><p style={{ fontSize: 14, fontWeight: 600, color: "#F3F5FA" }}>{error ? "Не удалось запустить" : status?.state === "running" ? "Minecraft запущен" : "Подготовка Vela Client"}</p><p style={{ fontSize: 10, color: error ? "#FF667C" : "#626D80", marginTop: 2 }}>{error || status?.message || progress?.message || "Проверка установки…"}</p></div></div>
        {!error && !finished && <><div className="h-1 rounded-full overflow-hidden" style={{ background: "#202736" }}><div className="h-full rounded-full transition-all duration-300" style={{ width: `${value}%`, background: "linear-gradient(90deg,#756CFF,#55CFFF)" }} /></div><div className="flex justify-between" style={{ fontSize: 10, color: "#626D80" }}><span>{progress?.detail ?? "Minecraft 26.2 / Fabric"}</span><span>{value}%</span></div></>}
        <button onClick={error || finished ? onClose : onCancel} className="self-end px-3 py-1.5 rounded-[7px] text-[11px] font-medium" style={{ background: "#141923", color: error ? "#FF667C" : "#9AA4B6", border: "1px solid #252D3D" }}>{error || finished ? "Закрыть" : "Отмена"}</button>
      </div>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<AppView>("loading");
  const [fading, setFading] = useState(false);
  const [persisted, setPersisted] = useState<PersistShape | null>(null);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [launchStatus, setLaunchStatus] = useState<LaunchStatus | null>(null);
  const [launchError, setLaunchError] = useState("");
  const [launchOpen, setLaunchOpen] = useState(false);
  const [openClientSettings, setOpenClientSettings] = useState(false);

  const refreshState = useCallback(async () => {
    try { setPersisted(await window.vela.state.get()); } catch { setPersisted(null); }
  }, []);

  useEffect(() => {
    void refreshState();
    const stopProgress = window.vela.game.onProgress(progress => setInstallProgress(progress));
    const stopStatus = window.vela.game.onLaunchStatus(status => setLaunchStatus(status));
    return () => { stopProgress(); stopStatus(); };
  }, [refreshState]);

  const go = useCallback((v: AppView) => {
    setFading(true);
    setTimeout(() => { setView(v); setFading(false); if (v === "mainmenu") void refreshState(); }, 120);
  }, [refreshState]);

  const launch = useCallback(async () => {
    setLaunchOpen(true); setLaunchError(""); setLaunchStatus(null); setInstallProgress(null);
    try {
      const state = await window.vela.state.get();
      let account = state.accounts.find(item => item.id === state.activeAccountId) ?? state.accounts[0];
      if (!account) { setLaunchOpen(false); go("accounts"); return; }
      if (account.type !== "offline" && account.expiresAt && account.expiresAt < Date.now() + 60_000) {
        account = account.type === "microsoft" ? await window.vela.auth.msRefresh(account)
          : account.type === "ely" ? await window.vela.auth.elyRefresh(account)
            : await window.vela.auth.littleSkinRefresh(account);
        const accounts = state.accounts.map(item => item.id === account.id ? account : item);
        await window.vela.state.saveAccounts(accounts, account.id);
      }
      const update = await window.vela.game.checkUpdate();
      if (!update.installed) await window.vela.game.install();
      await window.vela.game.launch(account);
      await refreshState();
      setLaunchOpen(false);
      window.vela.window.minimize();
    } catch (cause) {
      setLaunchError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [go, refreshState]);

  const activeAccount = persisted?.accounts.find(account => account.id === persisted.activeAccountId) ?? persisted?.accounts[0];

  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: "#07090D" }}>
      <WindowControls />
      <div className={`w-full h-full transition-opacity duration-[120ms] ${fading ? "opacity-0" : "opacity-100"}`}>
        {view === "loading" && <LoadingScreen onDone={() => go("mainmenu")} />}
        {view === "mainmenu" && <MainMenuScreen onAccounts={() => go("accounts")} onLaunch={() => void launch()} onSettings={() => { setOpenClientSettings(true); go("client"); }} account={activeAccount} installed={persisted?.stats.installed ?? false} />}
        {view === "accounts" && <AccountManager onBack={() => go("mainmenu")} />}
        {view === "client" && (
          <div className="w-full h-full flex items-center justify-center">
            <VelaClientWindow onBack={() => go("mainmenu")} initialSettingsOpen={openClientSettings} />
          </div>
        )}
      </div>
      {launchOpen && <LaunchOverlay progress={installProgress} status={launchStatus} error={launchError} onCancel={() => { void window.vela.game.cancel(); setLaunchOpen(false); }} onClose={() => setLaunchOpen(false)} />}
    </div>
  );
}
