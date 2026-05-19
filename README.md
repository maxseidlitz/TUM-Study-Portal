# TUM Study Portal

Persönliches Studiums-Dashboard für TU-München-Studenten — Electron-Desktop-App
mit Prüfungen, Stundenplan, To-Dos, Moodle-Kursen und einem lokalen KI-Assistenten
(Ollama).

## Funktionen
- Dashboard & Tagesansicht mit Countdown zur nächsten Prüfung
- Prüfungsverwaltung inkl. Lern-Log & Notenberechnung
- Stundenplan mit iCal-Import (z. B. TUMonline)
- Asana-artige To-Do-Verwaltung
- Moodle-Kurse & TUM-Links
- KI-Assistent (Chat + Empfehlungen) über ein **lokales** Ollama-Modell

---

## Entwicklung (lokal)

Voraussetzungen: Node.js 18+ und – für die KI-Funktionen – ein lokal laufendes
[Ollama](https://ollama.ai).

```bash
npm install
npm run dev
```

Im Dev-Modus nutzt die App das auf dem System installierte Ollama
(`http://localhost:11434`). Modell laden, falls noch nicht vorhanden:

```bash
ollama pull gemma4:e2b
```

---

## Windows-Build (.exe)

### Automatisch per GitHub Actions
Bei **jedem Push auf `main`** baut der Workflow
[`.github/workflows/build-desktop.yml`](.github/workflows/build-desktop.yml)
automatisch eine Windows-Installer-`.exe` und macOS-`.dmg`/`.zip`:

1. GitHub-Repo anlegen und Remote setzen:
   ```bash
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
2. Unter **Actions** laufen die Builds parallel (`windows-latest`, `macos-latest`).
3. Artefakte: **Windows** (`TUM-Study-Portal-Windows`, `.exe`) und **macOS** (`TUM-Study-Portal-macOS`, `.dmg` + `.zip`).

Der Workflow lädt die **Ollama-Runtime** herunter und packt sie in die `.exe`.
Das KI-Modell wird *nicht* mitgeliefert.

### Lokaler Build (optional)
```bash
# Ollama-Runtime nach resources/ollama/ legen, dann:
npm run dist:win
```

---

## Erster Start der App
- Die App enthält die Ollama-Runtime, lädt aber das Modell **`gemma4:e2b`
  (~7,2 GB) beim ersten Start automatisch herunter** — einmalig.
- Während des Downloads zeigt die App ein Fortschritts-Overlay; sie ist
  währenddessen bereits nutzbar (KI-Funktionen nutzen bis dahin eine lokale
  Fallback-Logik).
- Läuft bereits ein Ollama auf dem System, wird dieses verwendet.

## Hinweise
- Die `.exe` ist **nicht signiert** — Windows zeigt beim ersten Start eine
  SmartScreen-Warnung („Weitere Informationen“ → „Trotzdem ausführen“).
- Alle Daten werden **lokal** gespeichert (`%APPDATA%/tum-study-portal`),
  kein Cloud-Upload.
- App-Icon: optional `assets/icon.ico` (256×256) ablegen — wird automatisch
  übernommen; ohne Icon nutzt der Build das Standard-Electron-Icon.
