# ADR 0005 — Healthchecks Apps et politique SSRF homelab

## Statut

Accepté pour la Phase 5.

## Contexte

`app.test` connecte le serveur à une URL administrable et constitue donc une primitive SSRF. Le produit doit néanmoins joindre les plages LAN privées qui sont ses cibles légitimes.

## Décision

Seuls HTTP et HTTPS sans credentials sont stockés. Le healthcheck accepte uniquement un chemin résolu sur l'origine de l'App. Il résout toutes les adresses A/AAAA, les valide, choisit une adresse déterministe et la fournit au `lookup` du client Node ; la connexion utilise donc exactement l'adresse validée. HTTPS conserve le hostname original pour SNI et la validation TLS standard.

Loopback, unspecified, link-local/metadata et multicast sont bloqués, y compris via DNS. Les plages privées IPv4, CGNAT et ULA IPv6 restent autorisées pour le homelab. Les redirects ne sont jamais suivis, les headers restent anonymes, le body est détruit dès réception du status, et le timeout est borné entre 500 et 10 000 ms.

Le résultat est persisté seulement si `healthConfigRevision` correspond au snapshot testé. Aucun appel réseau ne garde une transaction DB ouverte. La Phase 5 ne fournit ni authentification de probe, ni retry, scheduler, historique ou polling.

## Conséquences

La résolution multi-adresses contenant une adresse bloquée est refusée en totalité. Les certificats privés non reconnus par la chaîne de confiance échouent normalement. Les credentials et politiques de confiance configurables relèvent des Phases 7 et 16 ; scheduler, historique et observabilité distribuée relèvent des Phases 12/13.
