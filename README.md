# The Ring

App per tracciare il ciclo di utilizzo dell'anello anticoncezionale (3 settimane inserito, 1 settimana fuori), con dashboard PWA installabile su smartphone e notifiche via [ntfy](https://ntfy.sh).

## Avvio

```bash
docker compose up -d --build
```

L'app sarà disponibile su `http://<ip-host>:8000`. Nessuna autenticazione: la sicurezza è delegata alla rete Tailscale.

I dati (SQLite) sono persistiti in `./data/ring.db` (montato come volume).

## Primo utilizzo

Alla prima apertura l'app chiede la data/ora di inserimento dell'anello attualmente in uso. Da lì calcola automaticamente:

- **Fase "Anello inserito"**: countdown di 21 giorni fino alla rimozione.
- **Fase "Anello fuori"**: countdown di 7 giorni fino al reinserimento.

I bottoni "Ho tolto l'anello" / "Ho inserito il nuovo anello" registrano l'evento e fanno scattare il ciclo successivo.

## Notifiche

Per default viene generato un topic ntfy casuale sul server pubblico `https://ntfy.sh` (visibile/modificabile in Impostazioni). Per riceverle:

1. Installa l'app **ntfy** su smartphone (Android/iOS).
2. Iscriviti al topic mostrato nella pagina Impostazioni dell'app.

Il server ntfy (anche self-hosted) e il topic sono modificabili in qualsiasi momento dalle Impostazioni.

Promemoria inviati:

- 2 giorni prima della scadenza.
- 1 giorno prima della scadenza.
- Ogni 6 ore se la scadenza viene superata senza registrare l'azione, finché non viene confermata.

## Installazione come app sul telefono

Aprendo l'URL da Safari (iOS) o Chrome (Android) e usando "Aggiungi a Home" / "Installa app" grazie al manifest PWA incluso.

## Sviluppo

Struttura:

- `app/` — backend FastAPI (API + scheduler notifiche in APScheduler + SQLite).
- `static/` — frontend PWA (HTML/CSS/JS vanilla, nessuna build necessaria).

Variabili d'ambiente:

- `RING_DB_PATH` (default `/data/ring.db`)
- `RING_TZ` (default `Europe/Rome`)
