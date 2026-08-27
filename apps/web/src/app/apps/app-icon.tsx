"use client";
import { useState } from "react";
export function AppIcon({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span aria-hidden="true">◆</span>;
  return (
    <img src={src} alt={`${name} icon`} width={40} height={40} onError={() => setFailed(true)} />
  );
}
