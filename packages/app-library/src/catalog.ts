import { createAppLibraryRegistry } from "./registry";
import type { AppDefinition, AppLibraryCategory, AppLifecycle } from "./types";

function icon(
  id: string,
  source: AppDefinition["icon"]["source"] = "dashboard-icons",
): AppDefinition["icon"] {
  return { path: `/app-icons/${id}.svg`, source };
}

function genericIcon(): AppDefinition["icon"] {
  return { path: "/app-icons/generic-app.svg", source: "internal" };
}

function def(input: {
  id: string;
  name: string;
  description: string;
  category: AppLibraryCategory;
  tags: readonly string[];
  website?: string;
  documentation?: string;
  port?: number;
  protocol?: "http" | "https";
  path?: string;
  target?: "same-tab" | "new-tab";
  healthPath?: string;
  dockerImages?: readonly string[];
  futureIntegrationType?: string;
  lifecycle?: AppLifecycle;
  iconFallback?: boolean;
}): AppDefinition {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    category: input.category,
    icon: input.iconFallback ? genericIcon() : icon(input.id),
    tags: input.tags,
    ...(input.website ? { website: input.website } : {}),
    ...(input.documentation ? { documentation: input.documentation } : {}),
    ...(input.port || input.protocol || input.path || input.target
      ? {
          defaults: {
            ...(input.protocol ? { protocol: input.protocol } : {}),
            ...(input.port ? { port: input.port } : {}),
            ...(input.path ? { path: input.path } : {}),
            ...(input.target ? { target: input.target } : {}),
          },
        }
      : {}),
    ...(input.healthPath
      ? { health: { suggestedPath: input.healthPath, suggestedMethod: "GET" } }
      : {}),
    ...(input.dockerImages ? { discovery: { dockerImages: input.dockerImages } } : {}),
    ...(input.futureIntegrationType ? { futureIntegrationType: input.futureIntegrationType } : {}),
    ...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
  };
}

export function createBuiltInAppLibrary() {
  return createAppLibraryRegistry()
    .register(
      def({
        id: "jellyfin",
        name: "Jellyfin",
        description: "Serveur média libre pour films, séries, musique et photos.",
        category: "media",
        tags: ["media", "streaming", "movies", "tv"],
        website: "https://jellyfin.org",
        documentation: "https://jellyfin.org/docs",
        port: 8096,
        healthPath: "/health",
        dockerImages: ["jellyfin/jellyfin", "linuxserver/jellyfin"],
        futureIntegrationType: "jellyfin",
      }),
    )
    .register(
      def({
        id: "plex",
        name: "Plex",
        description: "Serveur média pour organiser et diffuser une bibliothèque personnelle.",
        category: "media",
        tags: ["media", "streaming", "movies"],
        website: "https://www.plex.tv",
        port: 32400,
        dockerImages: ["plexinc/pms-docker", "linuxserver/plex"],
      }),
    )
    .register(
      def({
        id: "emby",
        name: "Emby",
        description: "Serveur média pour organiser et lire des contenus personnels.",
        category: "media",
        tags: ["media", "streaming"],
        website: "https://emby.media",
        port: 8096,
        dockerImages: ["emby/embyserver", "linuxserver/emby"],
      }),
    )
    .register(
      def({
        id: "immich",
        name: "Immich",
        description: "Sauvegarde et galerie de photos self-hosted.",
        category: "media",
        tags: ["photos", "backup", "gallery"],
        website: "https://immich.app",
        documentation: "https://immich.app/docs",
        port: 2283,
        dockerImages: ["ghcr.io/immich-app/immich-server"],
        futureIntegrationType: "immich",
      }),
    )
    .register(
      def({
        id: "photoprism",
        name: "PhotoPrism",
        description: "Galerie photo self-hosted avec recherche et organisation.",
        category: "media",
        tags: ["photos", "gallery", "search"],
        website: "https://www.photoprism.app",
        port: 2342,
        dockerImages: ["photoprism/photoprism"],
      }),
    )
    .register(
      def({
        id: "navidrome",
        name: "Navidrome",
        description: "Serveur de streaming musical compatible Subsonic.",
        category: "media",
        tags: ["music", "streaming", "subsonic"],
        website: "https://www.navidrome.org",
        port: 4533,
        dockerImages: ["deluan/navidrome"],
      }),
    )
    .register(
      def({
        id: "audiobookshelf",
        name: "Audiobookshelf",
        description: "Serveur d'audiobooks et de podcasts.",
        category: "media",
        tags: ["audiobooks", "podcasts", "media"],
        website: "https://www.audiobookshelf.org",
        port: 13378,
        dockerImages: ["ghcr.io/advplyr/audiobookshelf"],
      }),
    )
    .register(
      def({
        id: "jellyseerr",
        name: "Jellyseerr",
        description: "Demandes de médias pour Jellyfin et les applications *arr.",
        category: "media",
        tags: ["requests", "jellyfin", "arr"],
        website: "https://docs.jellyseerr.dev",
        port: 5055,
        dockerImages: ["fallenbagel/jellyseerr", "ghcr.io/fallenbagel/jellyseerr"],
        lifecycle: {
          status: "legacy",
          replacedBy: "seerr",
          note: "Jellyseerr et Overseerr sont unifiés dans Seerr.",
        },
      }),
    )
    .register(
      def({
        id: "overseerr",
        name: "Overseerr",
        description: "Demandes de médias pour Plex et les applications *arr.",
        category: "media",
        tags: ["requests", "plex", "arr"],
        website: "https://overseerr.dev",
        port: 5055,
        dockerImages: ["sctx/overseerr"],
        lifecycle: {
          status: "legacy",
          replacedBy: "seerr",
          note: "Jellyseerr et Overseerr sont unifiés dans Seerr.",
        },
      }),
    )
    .register(
      def({
        id: "seerr",
        name: "Seerr",
        description:
          "Demandes de médias pour Jellyfin, Plex et Emby, successeur d'Overseerr et Jellyseerr.",
        category: "media",
        tags: ["requests", "media", "jellyfin", "plex", "arr"],
        website: "https://seerr.dev",
        documentation: "https://docs.seerr.dev",
        port: 5055,
        healthPath: "/api/v1/settings/public",
        dockerImages: ["ghcr.io/seerr-team/seerr", "seerr/seerr"],
      }),
    )
    .register(
      def({
        id: "sonarr",
        name: "Sonarr",
        description: "Automatisation de séries TV pour usenet et torrents.",
        category: "downloads",
        tags: ["tv", "arr", "automation"],
        website: "https://sonarr.tv",
        port: 8989,
        dockerImages: ["linuxserver/sonarr", "ghcr.io/hotio/sonarr"],
      }),
    )
    .register(
      def({
        id: "radarr",
        name: "Radarr",
        description: "Automatisation de films pour usenet et torrents.",
        category: "downloads",
        tags: ["movies", "arr", "automation"],
        website: "https://radarr.video",
        port: 7878,
        dockerImages: ["linuxserver/radarr", "ghcr.io/hotio/radarr"],
      }),
    )
    .register(
      def({
        id: "lidarr",
        name: "Lidarr",
        description: "Automatisation de musique pour usenet et torrents.",
        category: "downloads",
        tags: ["music", "arr", "automation"],
        website: "https://lidarr.audio",
        port: 8686,
        dockerImages: ["linuxserver/lidarr"],
      }),
    )
    .register(
      def({
        id: "readarr",
        name: "Readarr",
        description: "Automatisation de livres pour usenet et torrents.",
        category: "downloads",
        tags: ["books", "arr", "automation"],
        website: "https://wiki.servarr.com/readarr",
        port: 8787,
        dockerImages: ["linuxserver/readarr"],
        lifecycle: {
          status: "retired",
          note: "Le projet Readarr est officiellement retiré par l'équipe Servarr.",
        },
      }),
    )
    .register(
      def({
        id: "prowlarr",
        name: "Prowlarr",
        description: "Gestionnaire d'indexeurs pour la suite *arr.",
        category: "downloads",
        tags: ["indexers", "arr", "automation"],
        website: "https://prowlarr.com",
        port: 9696,
        dockerImages: ["linuxserver/prowlarr"],
      }),
    )
    .register(
      def({
        id: "bazarr",
        name: "Bazarr",
        description: "Gestionnaire de sous-titres compagnon de Sonarr et Radarr.",
        category: "downloads",
        tags: ["subtitles", "arr", "automation"],
        website: "https://www.bazarr.media",
        port: 6767,
        dockerImages: ["linuxserver/bazarr"],
      }),
    )
    .register(
      def({
        id: "qbittorrent",
        name: "qBittorrent",
        description: "Client BitTorrent avec interface web.",
        category: "downloads",
        tags: ["torrent", "download", "bittorrent"],
        website: "https://www.qbittorrent.org",
        port: 8080,
        dockerImages: ["linuxserver/qbittorrent"],
      }),
    )
    .register(
      def({
        id: "transmission",
        name: "Transmission",
        description: "Client BitTorrent léger avec interface web.",
        category: "downloads",
        tags: ["torrent", "download", "bittorrent"],
        website: "https://transmissionbt.com",
        port: 9091,
        dockerImages: ["linuxserver/transmission"],
      }),
    )
    .register(
      def({
        id: "deluge",
        name: "Deluge",
        description: "Client BitTorrent avec interface web.",
        category: "downloads",
        tags: ["torrent", "download", "bittorrent"],
        website: "https://www.deluge-torrent.org",
        port: 8112,
        dockerImages: ["linuxserver/deluge"],
      }),
    )
    .register(
      def({
        id: "sabnzbd",
        name: "SABnzbd",
        description: "Client Usenet avec interface web.",
        category: "downloads",
        tags: ["usenet", "download", "nzb"],
        website: "https://sabnzbd.org",
        port: 8080,
        dockerImages: ["linuxserver/sabnzbd"],
      }),
    )
    .register(
      def({
        id: "nzbget",
        name: "NZBGet",
        description: "Client Usenet performant.",
        category: "downloads",
        tags: ["usenet", "download", "nzb"],
        website: "https://nzbget.com",
        port: 6789,
        dockerImages: ["linuxserver/nzbget"],
      }),
    )
    .register(
      def({
        id: "portainer",
        name: "Portainer",
        description: "Interface web de gestion Docker et Kubernetes.",
        category: "infrastructure",
        tags: ["docker", "containers", "admin"],
        website: "https://www.portainer.io",
        documentation: "https://docs.portainer.io",
        protocol: "https",
        port: 9443,
        dockerImages: ["portainer/portainer-ce"],
      }),
    )
    .register(
      def({
        id: "proxmox",
        name: "Proxmox VE",
        description: "Plateforme de virtualisation et de conteneurs.",
        category: "infrastructure",
        tags: ["hypervisor", "vm", "lxc"],
        website: "https://www.proxmox.com",
        documentation: "https://pve.proxmox.com/wiki",
        protocol: "https",
        port: 8006,
      }),
    )
    .register(
      def({
        id: "synology-dsm",
        name: "Synology DSM",
        description: "Système d'exploitation des NAS Synology.",
        category: "infrastructure",
        tags: ["nas", "storage", "synology"],
        website: "https://www.synology.com",
        protocol: "https",
        port: 5001,
        futureIntegrationType: "synology",
      }),
    )
    .register(
      def({
        id: "truenas",
        name: "TrueNAS",
        description: "Système de stockage NAS open source.",
        category: "infrastructure",
        tags: ["nas", "storage", "zfs"],
        website: "https://www.truenas.com",
      }),
    )
    .register(
      def({
        id: "openmediavault",
        name: "OpenMediaVault",
        description: "Distribution NAS basée sur Debian.",
        category: "infrastructure",
        tags: ["nas", "storage", "debian"],
        website: "https://www.openmediavault.org",
      }),
    )
    .register(
      def({
        id: "nginx-proxy-manager",
        name: "Nginx Proxy Manager",
        description: "Reverse proxy Nginx avec interface web et certificats.",
        category: "infrastructure",
        tags: ["proxy", "ssl", "nginx"],
        website: "https://nginxproxymanager.com",
        port: 81,
        dockerImages: ["jc21/nginx-proxy-manager"],
      }),
    )
    .register(
      def({
        id: "traefik",
        name: "Traefik",
        description: "Reverse proxy et load balancer cloud-native.",
        category: "infrastructure",
        tags: ["proxy", "ingress", "ssl"],
        website: "https://traefik.io",
        documentation: "https://doc.traefik.io/traefik",
        port: 8080,
        dockerImages: ["library/traefik"],
      }),
    )
    .register(
      def({
        id: "cockpit",
        name: "Cockpit",
        description: "Interface web d'administration de serveurs Linux.",
        category: "infrastructure",
        tags: ["linux", "admin", "server"],
        website: "https://cockpit-project.org",
        port: 9090,
      }),
    )
    .register(
      def({
        id: "uptime-kuma",
        name: "Uptime Kuma",
        description: "Outil de surveillance d'uptime self-hosted.",
        category: "monitoring",
        tags: ["uptime", "status", "monitoring"],
        website: "https://uptime.kuma.pet",
        port: 3001,
        dockerImages: ["louislam/uptime-kuma"],
        futureIntegrationType: "uptime-kuma",
      }),
    )
    .register(
      def({
        id: "beszel",
        name: "Beszel",
        description: "Surveillance légère de serveurs et de conteneurs.",
        category: "monitoring",
        tags: ["metrics", "servers", "monitoring"],
        website: "https://beszel.dev",
        port: 8090,
        dockerImages: ["henrygd/beszel"],
        futureIntegrationType: "beszel",
      }),
    )
    .register(
      def({
        id: "grafana",
        name: "Grafana",
        description: "Tableaux de bord et visualisation de métriques.",
        category: "monitoring",
        tags: ["dashboards", "metrics", "observability"],
        website: "https://grafana.com",
        port: 3000,
        dockerImages: ["grafana/grafana"],
      }),
    )
    .register(
      def({
        id: "prometheus",
        name: "Prometheus",
        description: "Collecte et interrogation de métriques.",
        category: "monitoring",
        tags: ["metrics", "timeseries", "observability"],
        website: "https://prometheus.io",
        port: 9090,
        dockerImages: ["prom/prometheus"],
        futureIntegrationType: "prometheus",
      }),
    )
    .register(
      def({
        id: "netdata",
        name: "Netdata",
        description: "Surveillance temps réel des ressources système.",
        category: "monitoring",
        tags: ["metrics", "realtime", "system"],
        website: "https://www.netdata.cloud",
        port: 19999,
        dockerImages: ["netdata/netdata"],
      }),
    )
    .register(
      def({
        id: "dozzle",
        name: "Dozzle",
        description: "Visualiseur de logs Docker en temps réel.",
        category: "monitoring",
        tags: ["docker", "logs", "containers"],
        website: "https://dozzle.dev",
        port: 8080,
        dockerImages: ["amir20/dozzle"],
      }),
    )
    .register(
      def({
        id: "glances",
        name: "Glances",
        description: "Moniteur système multi-plateforme avec interface web.",
        category: "monitoring",
        tags: ["system", "metrics", "monitoring"],
        website: "https://nicolargo.github.io/glances",
        port: 61208,
        dockerImages: ["nicolargo/glances"],
      }),
    )
    .register(
      def({
        id: "pi-hole",
        name: "Pi-hole",
        description: "Bloqueur de publicités et de DNS au niveau du réseau.",
        category: "network",
        tags: ["dns", "adblock", "network"],
        website: "https://pi-hole.net",
        dockerImages: ["pihole/pihole"],
      }),
    )
    .register(
      def({
        id: "adguard-home",
        name: "AdGuard Home",
        description: "Bloqueur de publicités et de trackers DNS.",
        category: "network",
        tags: ["dns", "adblock", "network"],
        website: "https://adguard.com/adguard-home.html",
        port: 3000,
        dockerImages: ["adguard/adguardhome"],
      }),
    )
    .register(
      def({
        id: "unifi",
        name: "UniFi Network Application",
        description: "Application de gestion du réseau UniFi.",
        category: "network",
        tags: ["wifi", "network", "controller"],
        website: "https://www.ui.com",
        protocol: "https",
        port: 8443,
        dockerImages: ["linuxserver/unifi-network-application", "linuxserver/unifi-controller"],
        lifecycle: {
          status: "active",
          note: "linuxserver/unifi-controller is retained only as a historical Docker discovery alias.",
        },
      }),
    )
    .register(
      def({
        id: "tailscale",
        name: "Tailscale",
        description: "Réseau overlay WireGuard pour relier des machines.",
        category: "network",
        tags: ["vpn", "wireguard", "mesh"],
        website: "https://tailscale.com",
        documentation: "https://tailscale.com/kb",
      }),
    )
    .register(
      def({
        id: "vaultwarden",
        name: "Vaultwarden",
        description: "Serveur Bitwarden compatible, léger et self-hosted.",
        category: "security",
        tags: ["passwords", "vault", "security"],
        website: "https://github.com/dani-garcia/vaultwarden",
        dockerImages: ["vaultwarden/server"],
      }),
    )
    .register(
      def({
        id: "authentik",
        name: "Authentik",
        description: "Fournisseur d'identité et SSO self-hosted.",
        category: "security",
        tags: ["sso", "oidc", "identity"],
        website: "https://goauthentik.io",
        port: 9000,
        dockerImages: ["ghcr.io/goauthentik/server"],
      }),
    )
    .register(
      def({
        id: "authelia",
        name: "Authelia",
        description: "Authentification unique et 2FA pour reverse proxies.",
        category: "security",
        tags: ["sso", "2fa", "auth"],
        website: "https://www.authelia.com",
        dockerImages: ["authelia/authelia"],
      }),
    )
    .register(
      def({
        id: "keycloak",
        name: "Keycloak",
        description: "Serveur d'identité open source pour SSO et IAM.",
        category: "security",
        tags: ["sso", "oidc", "iam"],
        website: "https://www.keycloak.org",
        port: 8080,
        dockerImages: ["quay.io/keycloak/keycloak"],
      }),
    )
    .register(
      def({
        id: "home-assistant",
        name: "Home Assistant",
        description: "Plateforme de domotique open source.",
        category: "home-automation",
        tags: ["home", "iot", "automation"],
        website: "https://www.home-assistant.io",
        port: 8123,
        dockerImages: ["homeassistant/home-assistant", "ghcr.io/home-assistant/home-assistant"],
      }),
    )
    .register(
      def({
        id: "node-red",
        name: "Node-RED",
        description: "Programmation visuelle de flux pour l'automatisation.",
        category: "home-automation",
        tags: ["flows", "iot", "automation"],
        website: "https://nodered.org",
        port: 1880,
        dockerImages: ["nodered/node-red"],
      }),
    )
    .register(
      def({
        id: "nextcloud",
        name: "Nextcloud",
        description: "Suite de fichiers, calendrier et collaboration self-hosted.",
        category: "productivity",
        tags: ["files", "sync", "collaboration"],
        website: "https://nextcloud.com",
        dockerImages: ["library/nextcloud"],
      }),
    )
    .register(
      def({
        id: "paperless-ngx",
        name: "Paperless-ngx",
        description: "Archivage et OCR de documents.",
        category: "productivity",
        tags: ["documents", "ocr", "archive"],
        website: "https://docs.paperless-ngx.com",
        port: 8000,
        dockerImages: ["ghcr.io/paperless-ngx/paperless-ngx"],
      }),
    )
    .register(
      def({
        id: "stirling-pdf",
        name: "Stirling PDF",
        description: "Outils PDF locaux : fusion, découpe, conversion.",
        category: "productivity",
        tags: ["pdf", "documents", "tools"],
        website: "https://www.stirlingpdf.com",
        port: 8080,
        dockerImages: ["stirlingtools/stirling-pdf"],
      }),
    )
    .register(
      def({
        id: "mealie",
        name: "Mealie",
        description: "Gestionnaire de recettes et de menus.",
        category: "productivity",
        tags: ["recipes", "food", "planning"],
        website: "https://mealie.io",
        port: 9000,
        dockerImages: ["ghcr.io/mealie-recipes/mealie"],
      }),
    )
    .register(
      def({
        id: "vikunja",
        name: "Vikunja",
        description: "Gestionnaire de tâches et de projets.",
        category: "productivity",
        tags: ["tasks", "kanban", "planning"],
        website: "https://vikunja.io",
        port: 3456,
        dockerImages: ["vikunja/vikunja"],
      }),
    )
    .register(
      def({
        id: "actual-budget",
        name: "Actual Budget",
        description: "Application de budget personnel self-hosted.",
        category: "productivity",
        tags: ["finance", "budget", "money"],
        website: "https://actualbudget.org",
        port: 5006,
        dockerImages: ["actualbudget/actual-server"],
      }),
    )
    .register(
      def({
        id: "gitea",
        name: "Gitea",
        description: "Forge Git légère self-hosted.",
        category: "development",
        tags: ["git", "forge", "ci"],
        website: "https://about.gitea.com",
        port: 3000,
        dockerImages: ["gitea/gitea"],
      }),
    )
    .register(
      def({
        id: "forgejo",
        name: "Forgejo",
        description: "Forge Git communautaire, fork de Gitea.",
        category: "development",
        tags: ["git", "forge", "ci"],
        website: "https://forgejo.org",
        port: 3000,
        dockerImages: ["codeberg.org/forgejo/forgejo"],
      }),
    )
    .register(
      def({
        id: "gitlab",
        name: "GitLab",
        description: "Forge Git avec CI/CD et gestion de projet.",
        category: "development",
        tags: ["git", "ci", "devops"],
        website: "https://about.gitlab.com",
        dockerImages: ["gitlab/gitlab-ce"],
      }),
    )
    .register(
      def({
        id: "code-server",
        name: "code-server",
        description: "VS Code dans le navigateur.",
        category: "development",
        tags: ["editor", "ide", "vscode"],
        website: "https://coder.com/docs/code-server",
        port: 8080,
        dockerImages: ["codercom/code-server"],
      }),
    )
    .register(
      def({
        id: "it-tools",
        name: "IT-Tools",
        description: "Collection d'outils pour développeurs et administrateurs.",
        category: "development",
        tags: ["tools", "utilities", "dev"],
        website: "https://it-tools.tech",
        dockerImages: ["corentinth/it-tools"],
      }),
    )
    .register(
      def({
        id: "bytestash",
        name: "ByteStash",
        description: "Gestionnaire de snippets de code self-hosted.",
        category: "development",
        tags: ["snippets", "code", "notes"],
        website: "https://github.com/jordan-dalby/ByteStash",
        dockerImages: ["ghcr.io/jordan-dalby/bytestash"],
      }),
    )
    .register(
      def({
        id: "searxng",
        name: "SearXNG",
        description: "Méta-moteur de recherche respectueux de la vie privée.",
        category: "development",
        tags: ["search", "privacy", "metasearch"],
        website: "https://docs.searxng.org",
        dockerImages: ["searxng/searxng"],
      }),
    )
    .register(
      def({
        id: "guacamole",
        name: "Apache Guacamole",
        description: "Passerelle de bureau distant dans le navigateur.",
        category: "development",
        tags: ["rdp", "vnc", "remote"],
        website: "https://guacamole.apache.org",
        dockerImages: ["guacamole/guacamole"],
      }),
    )
    .register(
      def({
        id: "open-webui",
        name: "Open WebUI",
        description: "Interface web pour modèles de langage locaux.",
        category: "development",
        tags: ["llm", "ai", "chat"],
        website: "https://docs.openwebui.com",
        port: 8080,
        dockerImages: ["ghcr.io/open-webui/open-webui"],
      }),
    )
    .register(
      def({
        id: "ntfy",
        name: "ntfy",
        description: "Notifications push HTTP simples et self-hosted.",
        category: "development",
        tags: ["notifications", "push", "alerts"],
        website: "https://ntfy.sh",
        documentation: "https://docs.ntfy.sh",
        dockerImages: ["binwiederhier/ntfy"],
      }),
    )
    .register(
      def({
        id: "homepage",
        name: "Homepage",
        description: "Tableau de bord homelab configurable.",
        category: "infrastructure",
        tags: ["dashboard", "homelab", "status"],
        website: "https://gethomepage.dev",
        documentation: "https://gethomepage.dev/installation/docker",
        port: 3000,
        dockerImages: ["ghcr.io/gethomepage/homepage"],
        iconFallback: true,
      }),
    )
    .register(
      def({
        id: "homarr",
        name: "Homarr",
        description: "Tableau de bord homelab tiers pour organiser des services.",
        category: "infrastructure",
        tags: ["dashboard", "homelab", "widgets"],
        website: "https://homarr.dev",
        documentation: "https://homarr.dev/docs/getting-started/installation/docker",
        port: 7575,
        dockerImages: ["ghcr.io/homarr-labs/homarr"],
        iconFallback: true,
      }),
    )
    .register(
      def({
        id: "dockge",
        name: "Dockge",
        description: "Gestionnaire de stacks Docker Compose avec interface web.",
        category: "infrastructure",
        tags: ["docker", "compose", "stacks"],
        website: "https://github.com/louislam/dockge",
        port: 5001,
        dockerImages: ["louislam/dockge"],
      }),
    )
    .register(
      def({
        id: "komodo",
        name: "Komodo",
        description: "Plateforme de déploiement et de gestion de serveurs et de stacks.",
        category: "infrastructure",
        tags: ["docker", "deploy", "servers"],
        website: "https://komo.do",
        documentation: "https://komo.do/docs/setup",
        port: 9120,
        dockerImages: ["ghcr.io/moghtech/komodo-core"],
      }),
    )
    .register(
      def({
        id: "n8n",
        name: "n8n",
        description: "Automatisation de workflows self-hosted.",
        category: "automation",
        tags: ["workflows", "automation", "integrations"],
        website: "https://n8n.io",
        documentation: "https://docs.n8n.io",
        port: 5678,
        dockerImages: ["n8nio/n8n", "docker.n8n.io/n8nio/n8n"],
      }),
    )
    .register(
      def({
        id: "activepieces",
        name: "Activepieces",
        description: "Automatisation de flux no-code et low-code self-hosted.",
        category: "automation",
        tags: ["workflows", "automation", "no-code"],
        website: "https://www.activepieces.com",
        documentation: "https://www.activepieces.com/docs",
        dockerImages: ["activepieces/activepieces", "ghcr.io/activepieces/activepieces"],
      }),
    )
    .register(
      def({
        id: "syncthing",
        name: "Syncthing",
        description: "Synchronisation de fichiers continue et décentralisée.",
        category: "storage",
        tags: ["sync", "files", "p2p"],
        website: "https://syncthing.net",
        documentation: "https://docs.syncthing.net",
        port: 8384,
        healthPath: "/rest/noauth/health",
        dockerImages: ["syncthing/syncthing"],
      }),
    )
    .register(
      def({
        id: "file-browser",
        name: "File Browser",
        description: "Explorateur de fichiers web pour un répertoire du serveur.",
        category: "storage",
        tags: ["files", "browser", "storage"],
        website: "https://filebrowser.org",
        dockerImages: ["filebrowser/filebrowser"],
      }),
    )
    .register(
      def({
        id: "scrutiny",
        name: "Scrutiny",
        description: "Surveillance S.M.A.R.T. des disques avec historique.",
        category: "monitoring",
        tags: ["smart", "disks", "storage"],
        website: "https://github.com/AnalogJ/scrutiny",
        port: 8080,
        dockerImages: ["ghcr.io/analogj/scrutiny", "linuxserver/scrutiny"],
      }),
    )
    .register(
      def({
        id: "proxmox-backup-server",
        name: "Proxmox Backup Server",
        description: "Sauvegarde dédupliquée pour machines virtuelles et hôtes.",
        category: "storage",
        tags: ["backup", "proxmox", "storage"],
        website: "https://www.proxmox.com",
        documentation: "https://pbs.proxmox.com/docs",
        protocol: "https",
        port: 8007,
      }),
    )
    .register(
      def({
        id: "tautulli",
        name: "Tautulli",
        description: "Statistiques et historique de lecture pour Plex.",
        category: "media",
        tags: ["plex", "stats", "media"],
        website: "https://tautulli.com",
        documentation: "https://docs.tautulli.com",
        port: 8181,
        dockerImages: ["tautulli/tautulli", "ghcr.io/tautulli/tautulli"],
      }),
    )
    .register(
      def({
        id: "kavita",
        name: "Kavita",
        description: "Serveur de lecture pour livres, comics et manga.",
        category: "media",
        tags: ["books", "comics", "manga"],
        website: "https://www.kavitareader.com",
        documentation: "https://wiki.kavitareader.com",
        port: 5000,
        dockerImages: ["jvmilazz0/kavita"],
      }),
    )
    .register(
      def({
        id: "calibre-web",
        name: "Calibre-Web",
        description: "Interface web pour une bibliothèque Calibre.",
        category: "media",
        tags: ["books", "ebooks", "calibre"],
        website: "https://github.com/janeczku/calibre-web",
        port: 8083,
        dockerImages: ["linuxserver/calibre-web"],
      }),
    )
    .register(
      def({
        id: "tdarr",
        name: "Tdarr",
        description: "Transcodage distribué de bibliothèques audio et vidéo.",
        category: "media",
        tags: ["transcode", "media", "ffmpeg"],
        website: "https://tdarr.io",
        documentation: "https://docs.tdarr.io",
        port: 8265,
        dockerImages: ["ghcr.io/haveagitgat/tdarr", "haveagitgat/tdarr"],
        iconFallback: true,
      }),
    )
    .register(
      def({
        id: "tube-archivist",
        name: "Tube Archivist",
        description: "Archive YouTube self-hosted avec indexation.",
        category: "media",
        tags: ["youtube", "archive", "media"],
        website: "https://www.tubearchivist.com",
        documentation: "https://docs.tubearchivist.com",
        port: 8000,
        dockerImages: ["bbilly1/tubearchivist"],
        iconFallback: true,
      }),
    )
    .register(
      def({
        id: "speedtest-tracker",
        name: "Speedtest Tracker",
        description: "Suivi périodique des performances de la connexion Internet.",
        category: "monitoring",
        tags: ["speedtest", "network", "monitoring"],
        website: "https://docs.speedtest-tracker.dev",
        dockerImages: ["linuxserver/speedtest-tracker"],
        iconFallback: true,
      }),
    )
    .register(
      def({
        id: "gatus",
        name: "Gatus",
        description: "Page de statut et contrôles de santé automatisés.",
        category: "monitoring",
        tags: ["status", "health", "monitoring"],
        website: "https://github.com/TwiN/gatus",
        port: 8080,
        dockerImages: ["twinproduction/gatus", "ghcr.io/twin/gatus"],
      }),
    )
    .register(
      def({
        id: "wg-easy",
        name: "wg-easy",
        description: "Interface web pour gérer un serveur WireGuard.",
        category: "network",
        tags: ["vpn", "wireguard", "network"],
        website: "https://github.com/wg-easy/wg-easy",
        port: 51821,
        dockerImages: ["ghcr.io/wg-easy/wg-easy"],
        iconFallback: true,
      }),
    )
    .register(
      def({
        id: "technitium-dns",
        name: "Technitium DNS",
        description: "Serveur DNS autoritaire et récursif avec console web.",
        category: "network",
        tags: ["dns", "resolver", "network"],
        website: "https://technitium.com/dns",
        port: 5380,
        dockerImages: ["technitium/dns-server"],
      }),
    )
    .register(
      def({
        id: "homebox",
        name: "Homebox",
        description: "Inventaire domestique pour objets, garanties et emplacements.",
        category: "productivity",
        tags: ["inventory", "home", "assets"],
        website: "https://homebox.software",
        port: 7745,
        dockerImages: ["ghcr.io/sysadminsmedia/homebox"],
      }),
    )
    .register(
      def({
        id: "freshrss",
        name: "FreshRSS",
        description: "Agrégateur RSS self-hosted.",
        category: "productivity",
        tags: ["rss", "news", "reader"],
        website: "https://freshrss.org",
        dockerImages: ["freshrss/freshrss"],
      }),
    )
    .register(
      def({
        id: "linkwarden",
        name: "Linkwarden",
        description: "Gestionnaire de favoris collaboratif avec archivage.",
        category: "productivity",
        tags: ["bookmarks", "archive", "links"],
        website: "https://linkwarden.app",
        documentation: "https://docs.linkwarden.app",
        port: 3000,
        dockerImages: ["ghcr.io/linkwarden/linkwarden"],
        iconFallback: true,
      }),
    )
    .register(
      def({
        id: "triliumnext",
        name: "TriliumNext",
        description: "Base de connaissances personnelle hiérarchique.",
        category: "productivity",
        tags: ["notes", "knowledge", "wiki"],
        website: "https://docs.triliumnotes.org",
        documentation: "https://docs.triliumnotes.org/user-guide/setup/server/installation/docker",
        port: 8080,
        dockerImages: ["triliumnext/trilium"],
      }),
    )
    .register(
      def({
        id: "netbox",
        name: "NetBox",
        description: "Source of truth pour l'infrastructure réseau.",
        category: "infrastructure",
        tags: ["dcim", "ipam", "network"],
        website: "https://netboxlabs.com/oss/netbox",
        documentation: "https://netboxlabs.com/docs/netbox",
        dockerImages: ["netboxcommunity/netbox"],
      }),
    )
    .freeze();
}

export const builtInAppLibrary = createBuiltInAppLibrary();
