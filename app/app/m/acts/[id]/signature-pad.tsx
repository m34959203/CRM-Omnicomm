"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Полотно подписи клиента: рисование пальцем/стилусом (pointer events),
 * экспорт PNG → onSave(blob). Белый фон, тёмные чернила — как на бумажном акте.
 */
export function SignaturePad({
  labels,
  busy,
  onSave,
}: {
  labels: { hint: string; clear: string; save: string };
  busy: boolean;
  onSave: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#1c1e22";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1); // точка при тапе
    ctx.stroke();
    setEmpty(false);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function up() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setEmpty(true);
  }

  return (
    <div>
      <p className="text-xs text-chrome-dim">{labels.hint}</p>
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="mt-2 h-40 w-full touch-none rounded-lg border border-chrome-line bg-white"
      />
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || empty}
          onClick={clear}
          className="min-h-11 rounded-lg border border-chrome-line text-sm font-medium text-chrome-text transition active:scale-95 disabled:opacity-40"
        >
          {labels.clear}
        </button>
        <button
          type="button"
          disabled={busy || empty}
          onClick={() => canvasRef.current?.toBlob((b) => b && onSave(b), "image/png")}
          className="min-h-11 rounded-lg bg-accent text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
        >
          {labels.save}
        </button>
      </div>
    </div>
  );
}
