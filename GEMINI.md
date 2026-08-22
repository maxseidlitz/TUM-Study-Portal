# TUM Student Dashboard 🎓

Das **TUM Student Dashboard** ist eine persönliche Desktop-Anwendung für Studierende der Technischen Universität München. Es kombiniert akademische Organisation mit modernster lokaler KI-Technologie.

## 🏗 Architektur & Technologien

- **Frontend:** React (Vite, TypeScript-kompatibel), Functional Components, Context API für State Management.
- **Desktop-Wrapper:** Electron.
- **Main-Prozess:** Verwaltet Daten-Persistenz, IPC-Kommunikation und die KI-Infrastruktur.
- **Datenhaltung:** Lokaler JSON-basierter Store (`public/store.js`), gespeichert im `userData`-Verzeichnis des Betriebssystems.
- **KI-Assistent:** Integration von **Ollama** (lokal) und **Google Gemini** (API). Unterstützt Hintergrund-Verarbeitung (Continuity) und Tool-Calling (z. B. automatisches Erstellen von To-Dos).
- **Internationalisierung:** Mehrsprachigkeit über JSON-Locales (`src/locales`).

## 🛠 Building and Running

- `npm install`: Installiert alle Abhängigkeiten.
- `npm run dev`: Startet die Vite-Entwicklungsumgebung und Electron parallel.
- `npm run build`: Baut das React-Frontend für die Produktion.
- `npm run dist:win`: Erzeugt einen Windows-Installer (.exe) via electron-builder.
- `npm run dist:mac`: Erzeugt ein macOS Disk-Image (.dmg) via electron-builder.
- `npm run lint`: Prüft den Code auf Einhaltung der ESLint-Regeln.

## 📏 Development Conventions

### Code-Stil & Komponenten
- **Funktionale Komponenten:** Ausschließlich funktionale Komponenten mit Hooks verwenden.
- **Zentrales State Management:** Globale Daten (Prüfungen, To-Dos, KI-Status) liegen im `DataContext.jsx`.
- **Surgische Edits:** Code-Änderungen sollten präzise und kontextbewusst sein. Bestehende Muster (z. B. Icon-Imports, Style-Objekte) beibehalten.
- **Modularisierung:** Große Komponenten werden in Unterkomponenten in entsprechenden Unterordnern (z. B. `src/components/exams/`) aufgeteilt.

### KI & Hintergrundprozesse
- **Continuity Feature:** KI-Anfragen werden global im `DataContext` verwaltet, um Navigation während des "Thinkings" zu ermöglichen.
- **Tool Use:** Die KI kann `create_todo` aufrufen. Diese Logik wird in `public/ai.js` (Backend) und `src/context/DataContext.jsx` (Frontend-Sync) gehandhabt.

### Sicherheit & Persistenz
- **Daten-Integrität:** Nach jeder Änderung am Store (`saveStore`) muss sichergestellt werden, dass das Frontend via `refreshData` / `loadAll` synchronisiert wird.
- **IPC Sicherheit:** Kommunikation zwischen Main und Renderer erfolgt ausschließlich über die `window.api` Bridge (`public/preload.js`).

## 🚀 Onboarding & Dokumentation
- Ein geführter Setup-Assistent (`src/components/SetupWizard.jsx`) leitet neue Nutzer in wenigen Schritten durch den iCal-Import (Stundenplan + optional Prüfungen). Der Onboarding-Status wird in den Settings persistiert (`onboardingCompleted`).
- Die `README.md` enthält detaillierte Anleitungen zum iCal-Import und zum macOS-Gatekeeper-Workaround.
