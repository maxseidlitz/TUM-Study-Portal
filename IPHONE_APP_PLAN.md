# iPhone-App und Self-Hosting — Umsetzungsplan

## Zielbild

Das TUM Study Portal läuft als installierbare Progressive Web App (PWA) auf dem
iPhone und wird auf einem privaten Server betrieben. Nach „Zum Home-Bildschirm“
startet es im Standalone-Modus ohne Browser-Chrome, berücksichtigt Notch und
Home-Indikator und fühlt sich durch mobile Navigation, Touch-Interaktionen und
iOS-nahe Übergänge wie eine App an.

Die bestehende Electron-App bleibt zunächst funktionsfähig. Beide Clients sollen
dieselbe fachliche API verwenden.

## Architekturentscheidung

### PWA zuerst

Eine PWA passt besser als eine native Swift-App zum gewünschten Hosting-Modell:

- eine Codebasis für Desktop-Web, iPhone und Electron,
- Installation direkt vom privaten Server, ohne App Store und Signierung,
- Updates werden zentral auf dem Server ausgerollt,
- iOS unterstützt Standalone-PWAs, App-Icons, Service Worker und Web Push.

Ein Capacitor- oder Swift-Wrapper ist erst sinnvoll, wenn später Funktionen
benötigt werden, die eine PWA nicht zuverlässig abdeckt, etwa tiefe
HealthKit-/Calendar-Integration, Widgets oder App-Store-Verteilung.

### Zielarchitektur

```text
iPhone PWA / Browser / Electron Renderer
                  |
          gemeinsamer API-Client
                  |
             HTTPS / REST
                  |
       Node.js Application Server
        |          |           |
      SQLite   iCal/Mensa    Ollama
        |
  verschlüsselte Backups
```

Der aktuelle Renderer greift direkt über `window.api` auf Electron-IPC zu. Diese
Kopplung wird durch eine Adapter-Schicht ersetzt:

- `electronApi`: delegiert an die bestehende Preload-Bridge,
- `httpApi`: spricht mit `/api/*` auf dem privaten Server,
- React-Kontexte und Komponenten verwenden nur noch das gemeinsame Interface.

Die Logik aus Electron-Main-Prozess und `store.js` wandert schrittweise in
serverseitige Services. Dadurch bleiben Datenbank-, KI- und Proxy-Zugriffe vom
iPhone aus sicher serverseitig.

## Sicherheitsmodell

Das System darf nicht als ungeschützte Webseite veröffentlicht werden.

Empfohlener Standard:

1. Zugriff nur über WireGuard/Tailscale oder ein vergleichbares privates Netz.
2. HTTPS auch im privaten Netz; keine Service-Worker- oder Login-Nutzung über
   unverschlüsseltes HTTP.
3. Zusätzlich App-Anmeldung mit sicherem, `HttpOnly`/`Secure`/`SameSite`
   Session-Cookie. Keine Tokens in `localStorage`.
4. Serverseitige Validierung aller Payloads, Größenlimits, CSRF-Schutz,
   Rate-Limits für Login und KI sowie eine enge Allowlist für iCal-Proxy-Ziele
   gegen SSRF.
5. Secrets ausschließlich als Server-Environment-Variablen; Gemini-Schlüssel
   werden nie an den Browser ausgeliefert.
6. SQLite-Daten und Backups liegen in persistenten Volumes. Regelmäßige,
   verschlüsselte Backups werden außerhalb des Containers aufbewahrt und durch
   einen Restore-Test geprüft.

Falls der Dienst direkt aus dem Internet erreichbar sein muss, kommen ein
Reverse Proxy wie Caddy mit automatischem TLS, eine echte Domain, Fail2ban bzw.
Provider-Firewall und verpflichtende Authentifizierung hinzu.

## iPhone User Experience

### App-Shell

- `viewport-fit=cover`, Safe-Area-Inset-Unterstützung und dynamische
  Viewport-Höhen (`100dvh`),
- feste Bottom-Tab-Bar für Heute, Aufgaben, Stundenplan, Chat und „Mehr“,
- kompakte Top-Bar mit kontextbezogenen Aktionen statt Desktop-Sidebar,
- Statusleiste, Theme-Farbe und App-Icons für Light/Dark Mode,
- direkte URLs pro Bereich und Wiederherstellung des letzten Zustands.

### Interaktion

- mindestens 44 × 44 pt große Touch-Ziele,
- keine Funktionen, die nur über Hover erreichbar sind,
- native Form-Ergonomie mit passenden `inputmode`-, Datum- und Zeitfeldern,
- Bottom Sheets bzw. Vollbild-Editoren anstelle kleiner Desktop-Modals,
- Swipe nur als Komfortfunktion; jede Aktion bleibt per sichtbarem Button
  erreichbar,
- sofortiges optimistisches Feedback, Skeleton-States und klare
  Offline-/Fehleranzeigen,
- respektierte Systemeinstellungen für Dark Mode und reduzierte Bewegung.

### PWA-Verhalten

- Manifest mit `display: standalone`, Icons und App-Shortcuts,
- Service Worker für versionierte statische Assets und eine Offline-Shell,
- Datenänderungen werden anfangs nur online erlaubt; kein stilles,
  konfliktanfälliges Offline-Schreiben,
- Update-Hinweis statt überraschendem Reload,
- optional Web Push für Prüfungen und Aufgaben nach einem separaten
  Berechtigungs-Onboarding.

## Umsetzung in Etappen

### 1. Technisches Fundament

- API-Vertrag für Prüfungen, Vorlesungen, Aufgaben, Module, Lernlogs,
  Einstellungen, Chats, Backups, iCal, Mensa und KI dokumentieren.
- Direkte `window.api`-Aufrufe hinter einen gemeinsamen Client-Adapter ziehen.
- React-App im normalen Browser ohne Electron start- und testbar machen.
- Browser-Routing und Fehlerbehandlung für API-Ausfälle ergänzen.

**Abnahme:** Derselbe Renderer läuft gegen Electron-IPC und gegen einen
Mock-HTTP-Adapter; bestehende Unit-Tests bleiben grün.

### 2. Self-Hosted Backend

- Node-Server mit versionierter REST-API (`/api/v1`) und Health-Endpunkt bauen.
- JSON-Dateispeicher durch SQLite mit Migrationen, Transaktionen und
  referenziellen Regeln ersetzen.
- vorhandene iCal-, Mensa- und KI-Logik in testbare Server-Services überführen.
- Login, Session-Verwaltung, Validierung, Logging und Backup/Restore einbauen.
- einmaligen Import eines bestehenden Desktop-Exports ermöglichen.

**Abnahme:** Alle Kernfunktionen sind über HTTPS und nach Anmeldung verfügbar;
Neustarts verlieren keine Daten; Export und Restore sind getestet.

### 3. Mobile App-Shell

- responsive Shell mit Desktop-Sidebar und iPhone-Tab-Bar implementieren,
- Safe Areas, mobile Typografie, Touch-Ziele und scrollbare Seiten korrigieren,
- Navigation auf fünf Primärziele reduzieren; seltene Bereiche unter „Mehr“,
- globale Modals auf mobile Bottom Sheets/Vollbildansichten umstellen.

**Abnahme:** Keine horizontale Überbreite bei 320–430 px; alle Kernflows sind
mit einer Hand bedienbar und funktionieren ohne Hover.

### 4. Featureweise iPhone-Optimierung

Reihenfolge nach täglichem Nutzen:

1. Heute/Dashboard,
2. Aufgaben inklusive Detail und Schnellanlage,
3. Stundenplan mit mobil lesbarer Tagesansicht,
4. Chat mit tastaturfester Eingabezeile,
5. Prüfungen und Lernzeit,
6. Module, Links, Einstellungen, Import und Backup.

Breite Tabellen und Wochenraster erhalten mobile Alternativen, statt lediglich
kleiner skaliert zu werden.

**Abnahme:** Anlegen, Bearbeiten, Löschen und Wiederherstellen funktionieren für
alle Entitäten auf einem echten iPhone; Bildschirmtastatur verdeckt keine
primären Aktionen.

### 5. PWA und Deployment

- Manifest, Icons, Service Worker, Installationshinweis und Update-Flow,
- Docker-Image mit nicht-root Benutzer und reproduzierbarem Build,
- Compose-Beispiel für App, persistente Daten und optional Caddy,
- Healthchecks, strukturierte Logs und dokumentierte Umgebungsvariablen,
- Deployment-Anleitung für Domain/TLS, Tailscale und Backup-Rotation.

**Abnahme:** Neuinstallation aus Safari, Start vom Home-Bildschirm, Update,
Server-Neustart und Restore wurden auf einem physischen iPhone geprüft.

### 6. Qualität und Absicherung

- Unit-Tests für Services und API-Adapter,
- Integrations-Tests für Auth, CRUD, Migration und Import,
- Browser-E2E-Tests in iPhone-Viewports,
- manuelle Tests auf aktuellem iOS/Safari, insbesondere Standalone-Modus,
  Bildschirmtastatur, Safe Areas und Rücknavigation,
- automatischer Build-, Test- und Container-Sicherheitscheck in CI.

## Bewusst nicht im ersten Schnitt

- App-Store-Veröffentlichung oder nativer iOS-Wrapper,
- vollständige Offline-Synchronisation mit Konfliktauflösung,
- Multi-User- und Rollenmodell,
- native iOS-Widgets, HealthKit oder tiefgreifende Kalenderintegration,
- Push-Benachrichtigungen, bevor der Kernbetrieb stabil und abgesichert ist.

## Erste konkrete Implementierungsstrecke

1. API-Interface aus `public/preload.js` als gemeinsamen Vertrag extrahieren.
2. Browserfähigen HTTP-Adapter und einen kleinen Node-Server mit Healthcheck
   anlegen.
3. Authentifizierten Settings- und Todo-Flow Ende-zu-Ende migrieren.
4. Danach die übrigen Entitäten übernehmen.
5. Parallel erst nach funktionierendem Datenpfad die mobile App-Shell bauen.

Diese Reihenfolge reduziert das Hauptrisiko: Eine reine mobile CSS-Anpassung
würde aktuell im iPhone-Browser nicht funktionieren, weil Persistenz, iCal und
KI vollständig an Electron-IPC gebunden sind.
