"use client";
import { useEffect, useState } from "react";
import type { BoardSnapshot } from "@dashboard/boards";
import { BoardReadGrid } from "./board-read-grid";

const MOBILE_QUERY = "(max-width: 767px)";
export function ResponsiveBoardReadGrid({ snapshot }: { snapshot: BoardSnapshot }) {
  const [requested, setRequested] = useState<"desktop" | "mobile">("desktop");
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => setRequested(media.matches ? "mobile" : "desktop");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const layout =
    snapshot.layouts.find((entry) => entry.breakpoint === requested) ??
    snapshot.layouts.find((entry) => entry.breakpoint !== requested) ??
    snapshot.layouts[0];
  if (!layout) return <p>Aucun layout disponible.</p>;
  return (
    <BoardReadGrid
      layout={layout}
      items={snapshot.items}
      placements={snapshot.placements.filter((entry) => entry.layoutId === layout.id)}
    />
  );
}
