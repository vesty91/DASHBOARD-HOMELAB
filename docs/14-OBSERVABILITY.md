# 14 — Observabilité

## 1. Logs

Format JSON production.

Champs :

```text
timestamp
level
service
requestId
userId safe
operation
durationMs
result
errorCode
integrationId safe
```

Jamais :

- token ;
- password ;
- cookie ;
- auth header.

## 2. Correlation

Générer `requestId`.

Propager :

- web -> API ;
- API -> integration ;
- worker jobs.

## 3. Metrics internes

Exemples :

```text
http_requests_total
http_request_duration_ms
integration_requests_total
integration_request_duration_ms
integration_errors_total
jobs_total
jobs_failed_total
websocket_connections
db_query_duration_ms
```

## 4. Health

Voir déploiement.

## 5. Integration health

État :

```text
unknown
healthy
degraded
down
misconfigured
unauthorized
```

Ne pas écraser `misconfigured` par `down`.

## 6. Staleness

Les données mises en cache doivent inclure :

```text
fetchedAt
staleAt
```

UI :

- normal ;
- stale ;
- disconnected.

## 7. Worker jobs

Chaque job doit être observable :

- last run ;
- next run ;
- duration ;
- status ;
- error code.

## 8. Audit log vs application log

Audit log = preuve d'action métier.

Application log = diagnostic technique.

Ne pas les confondre.

## 9. Prometheus export interne

Phase ultérieure mais architecture prête.

Endpoint :

```text
/metrics
```

protégé/réseau interne selon déploiement.
