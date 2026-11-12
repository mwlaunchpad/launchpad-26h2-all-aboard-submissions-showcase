import { useWidth } from '../lib/hooks.js';

const PHONE = { w: 390, h: 844 };
const DESKTOP = { w: 1440, h: 900 };

/**
 * A phone (390×844) or desktop (1440×900) frame. Children render at native size and are scaled to fit
 * the available width, capped by maxHeight. Use `image` for screenshots (no transform needed).
 */
export function DeviceFrame({ device = 'phone', maxWidth = 360, maxHeight = 760, children, image, alt = '', className = '', tone = 'light' }) {
  const native = device === 'desktop' ? DESKTOP : PHONE;
  const [ref, avail] = useWidth();
  const bezel = device === 'desktop' ? 0 : 12;
  const chrome = device === 'desktop' ? 28 : 0;
  const widthByHeight = ((maxHeight - bezel * 2 - chrome) * native.w) / native.h + bezel * 2;
  const outer = Math.max(140, Math.min(avail || maxWidth, maxWidth, widthByHeight));
  const inner = outer - bezel * 2;
  const scale = inner / native.w;
  return (
    <div ref={ref} className={`frame-slot ${className}`}>
      <div className={`frame frame--${device} frame--${tone}`} style={{ width: outer }}>
        {device === 'desktop' && (
          <div className="frame__chrome" style={{ height: chrome }}>
            <span />
            <span />
            <span />
          </div>
        )}
        <div className="frame__screen" style={{ width: inner, height: native.h * scale }}>
          {image ? (
            <img src={image} alt={alt} loading="lazy" decoding="async" />
          ) : (
            <div className="frame__native" style={{ width: native.w, height: native.h, transform: `scale(${scale})` }}>
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
