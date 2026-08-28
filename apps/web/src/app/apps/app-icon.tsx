"use client";
import { useState } from "react";

export function AppIcon({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.9" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.45" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.6" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.3" />
      </svg>
    );
  return (
    <img src={src} alt={`${name} icon`} width={40} height={40} onError={() => setFailed(true)} />
  );
}
