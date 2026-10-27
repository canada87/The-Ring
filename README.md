# The Ring

App per tracciare il ciclo di utilizzo dell'anello anticoncezionale (3 settimane inserito, 1 settimana fuori), con dashboard PWA installabile su smartphone e notifiche via [ntfy](https://ntfy.sh).

## Avvio

```bash
docker compose up -d --build
```

L'app sarà disponibile su `http://<ip-host>:8000`. Nessuna autenticazione: la sicurezza è delegata alla rete Tailscale.

I dati (SQLite) sono persistiti in `./data/ring.db` (montato come volume).

### Immagine pronta (GitHub Container Registry)

Ad ogni push di un tag `v*` (es. `v1.0.0`) una GitHub Action costruisce l'immagine Docker e la pubblica su `ghcr.io/canada87/the-ring`, con i tag `1.0.0`, `1.0` e `latest`:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Per usarla al posto della build locale, in `docker-compose.yml` sostituisci `build: .` con `image: ghcr.io/canada87/the-ring:latest`.

## Primo utilizzo

Alla prima apertura l'app chiede la data/ora di inserimento dell'anello attualmente in uso. Da lì calcola automaticamente:

- **Fase "Anello inserito"**: countdown di 21 giorni fino alla rimozione.
- **Fase "Anello fuori"**: countdown di 7 giorni fino al reinserimento.

I bottoni "Ho tolto l'anello" / "Ho inserito il nuovo anello" registrano l'evento e fanno scattare il ciclo successivo.

## Notifiche

Dalle Impostazioni si sceglie il canale: **ntfy** (notifica push) oppure **email**.

### ntfy

Per default viene generato un topic ntfy casuale sul server pubblico `https://ntfy.sh` (visibile/modificabile in Impostazioni). Per riceverle:

1. Installa l'app **ntfy** su smartphone (Android/iOS).
2. Iscriviti al topic mostrato nella pagina Impostazioni dell'app.

Il server ntfy (anche self-hosted) e il topic sono modificabili in qualsiasi momento dalle Impostazioni.

### Email

Le credenziali SMTP si configurano solo lato server, tramite variabili d'ambiente (non vengono salvate nel database né esposte dalle API). Copia `.env.example` in `.env`, compila i valori e riavvia:

```bash
cp .env.example .env
docker compose up -d --build
```

Poi, in Impostazioni, scegli il canale "Email", inserisci l'indirizzo destinatario e premi "Invia test".

### Promemoria

Promemoria inviati (su qualunque canale):

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
- `RING_SMTP_HOST`, `RING_SMTP_PORT` (default `587`), `RING_SMTP_USER`, `RING_SMTP_PASSWORD`, `RING_SMTP_FROM` (default: `RING_SMTP_USER`), `RING_SMTP_SECURITY` (`starttls` | `ssl` | `none`, default `starttls`) — necessarie solo per le notifiche email
