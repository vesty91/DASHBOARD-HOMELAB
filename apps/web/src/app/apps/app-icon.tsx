"use client";

import { useState } from "react";

const FALLBACK = "/app-icons/generic-app.svg";

export function AppIcon({ src, name }: { src: string | null | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  const resolved = !src || failed ? FALLBACK : src;
  return (
    <img
      src={resolved}
      alt={`Icône ${name}`}
      width={40}
      height={40}
      onError={() => {
        if (!failed) setFailed(true);
      }}
    />
  );
}
