import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { COLOR_REGEX, hexToHsv, hsvToHex } from './gridColor';
export function ColorSelectorPopup({ value, rect, onChange, onClose }: {
  value: string; rect: DOMRect;
  onChange: (c: string) => void; onClose: () => void;
}) {
  const hasAlpha = value.length === 9;
  const [init] = useState(() => hexToHsv(value));
  const [h, setH] = useState(init.h);
  const [s, setS] = useState(init.s);
  const [v, setV] = useState(init.v);
  const [a, setA] = useState(init.a);
  const [hexInput, setHexInput] = useState(value);

  // drag 中に最新値を参照するためのref
  const hR = useRef(init.h), sR = useRef(init.s), vR = useRef(init.v), aR = useRef(init.a);

  const popupRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: rect.bottom + 4, left: rect.left });

  useLayoutEffect(() => {
    if (!popupRef.current) return;
    const { height, width } = popupRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4 + height > window.innerHeight ? rect.top - height - 4 : rect.bottom + 4,
      left: Math.max(4, Math.min(rect.left, window.innerWidth - width - 4)),
    });
  }, [rect]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const emit = useCallback((nh: number, ns: number, nv: number, na: number) => {
    const c = hsvToHex(nh, ns, nv, na, hasAlpha);
    setHexInput(c);
    onChange(c);
  }, [onChange, hasAlpha]);

  const makeDragger = (fn: (e: MouseEvent) => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn(e.nativeEvent);
    const mv = (ev: MouseEvent) => fn(ev);
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  };

  const onSquare = makeDragger(e => {
    if (!squareRef.current) return;
    const r = squareRef.current.getBoundingClientRect();
    const ns = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const nv = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    sR.current = ns; vR.current = nv; setS(ns); setV(nv);
    emit(hR.current, ns, nv, aR.current);
  });

  const onHue = makeDragger(e => {
    if (!hueRef.current) return;
    const r = hueRef.current.getBoundingClientRect();
    const nh = Math.max(0, Math.min(360, (e.clientX - r.left) / r.width * 360));
    hR.current = nh; setH(nh);
    emit(nh, sR.current, vR.current, aR.current);
  });

  const onAlpha = makeDragger(e => {
    if (!alphaRef.current) return;
    const r = alphaRef.current.getBoundingClientRect();
    const na = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    aR.current = na; setA(na);
    emit(hR.current, sR.current, vR.current, na);
  });

  const onHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexInput(val);
    if (COLOR_REGEX.test(val)) {
      const p = hexToHsv(val);
      hR.current = p.h; sR.current = p.s; vR.current = p.v; aR.current = p.a;
      setH(p.h); setS(p.s); setV(p.v); setA(p.a);
      onChange(val);
    }
  };

  const hueColor = `hsl(${h}, 100%, 50%)`;
  const previewColor = hsvToHex(h, s, v, a, hasAlpha);

  return (
    <div
      ref={popupRef}
      className="color-selector-popup"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* グラデーション正方形 */}
      <div
        ref={squareRef}
        className="color-selector-popup__square"
        style={{ background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, ${hueColor})` }}
        onMouseDown={onSquare}
      >
        <div className="color-selector-popup__dot" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }} />
      </div>

      {/* 色相スライダー */}
      <div ref={hueRef} className="color-selector-popup__slider" onMouseDown={onHue}>
        <div className="color-selector-popup__hue-track" />
        <div className="color-selector-popup__thumb" style={{ left: `${h / 360 * 100}%` }} />
      </div>

      {/* 透明度スライダー（8桁hexのみ） */}
      {hasAlpha && (
        <div ref={alphaRef} className="color-selector-popup__slider" onMouseDown={onAlpha}>
          <div className="color-selector-popup__checker" />
          <div className="color-selector-popup__alpha-track" style={{ background: `linear-gradient(to right, transparent, ${hsvToHex(h, s, v)})` }} />
          <div className="color-selector-popup__thumb" style={{ left: `${a * 100}%` }} />
        </div>
      )}

      {/* プレビュー + hex入力 */}
      <div className="color-selector-popup__bottom">
        <div className="color-selector-popup__preview" style={{ backgroundColor: previewColor }} />
        <input
          className="color-selector-popup__hex"
          value={hexInput}
          onChange={onHexChange}
          spellCheck={false}
          maxLength={9}
        />
      </div>
    </div>
  );
}
