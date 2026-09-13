"use client";
import type { JellyfinPlaybackMode, JellyfinSessionsView } from "../jellyfin-sessions";

function playbackLabel(mode: JellyfinPlaybackMode | null): string {
  switch (mode) {
    case "direct-play":
      return "Direct play";
    case "direct-stream":
      return "Direct stream";
    case "transcode":
      return "Transcode";
    case null:
      return "Indisponible";
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

export function JellyfinSessionsWidget({ view }: { view: JellyfinSessionsView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration Jellyfin</p>;
  if (view.status === "empty") return <p role="status">Intégration Jellyfin introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-jellyfin-sessions">
      <p>
        {view.serverName ?? "Jellyfin"}
        {view.version ? ` · ${view.version}` : ""}
      </p>
      <p className="widget-state">
        {view.activeCount} session{view.activeCount === 1 ? "" : "s"} active
        {view.activeCount === 1 ? "" : "s"}
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
      {view.sessions.length === 0 ? (
        <p className="widget-state">Aucune lecture en cours</p>
      ) : (
        <ul>
          {view.sessions.map((session) => (
            <li key={session.id}>
              <strong>{session.nowPlayingName ?? "Aucune lecture"}</strong>
              {" · "}
              {session.userLabel}
              {session.deviceName ? ` · ${session.deviceName}` : ""}
              {" · "}
              {playbackLabel(session.playbackMode)}
              {session.playbackMode === "transcode" && session.transcodeProgressPercent !== null
                ? ` ${Math.round(session.transcodeProgressPercent)} %`
                : ""}
              {session.paused === true ? " · Pause" : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
