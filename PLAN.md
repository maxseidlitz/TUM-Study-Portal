# TUM Student Dashboard — Projektplan

## Zielbild

Ein Desktop-App für TUM-Studierende, der **wirklich genutzt wird**, weil er drei Dinge besser macht als jedes Spreadsheet:

1. **Alles an einem Ort** — Prüfungen, Vorlesungen, Todos und Mensa-Menü kommen automatisch rein, nicht per Hand.
2. **Vertrauenswürdig** — Daten gehen nicht verloren, Fehler werden sichtbar, Features tun was sie versprechen.
3. **AI, die hilft** — Der Chat kennt den eigenen Stundenplan und erinnert sich an Gespräche. Die tägliche Empfehlung führt direkt zur Aktion.

**Ziel-User:** TUM-Bachelor/Master-Student, nutzt TUM Online + Moodle, läuft auf eigenem Mac/Windows-Laptop, will keine Cloud-Accounts.

---

## Status heute

| Bereich | Status | Kernproblem |
|---|---|---|
| Dashboard / Today | ✅ Funktioniert | — |
| Todos | ✅ Funktioniert | — |
| Vorlesungen (iCal-Import) | ✅ Funktioniert | — |
| Prüfungen | ✅ Vollständig | iCal-Import, CSV-Export, Todo-Vorschlag |
| Module | ✅ Ehrlich | Moodle-Sync-Fake entfernt, Info-Dialog |
| Chat | ✅ Funktioniert | Auto-Titel aus erster Message |
| Pomodoro | ✅ Funktioniert | Exam + Todo loggbar |
| Datensicherung | ✅ Funktioniert | Export/Import + Auto-Backup |
| Fehlerbehandlung | ✅ Funktioniert | Toast-System aktiv |
| Onboarding-Tour | ✅ Repariert | Import-Bug + localStorage-Key gefixt |

---

## Phase 1 — Fundament (Vertrauen herstellen)

**Ziel:** Die App kann bedenkenlos täglich genutzt werden. Daten sind sicher, Fehler sind sichtbar.

### 1.1 Datensicherung & -transfer
- [x] **Export**: Alle Daten als JSON-Datei exportieren — Button in Settings
- [x] **Import / Restore**: Exportierte JSON-Datei wieder einlesen
- [x] **Auto-Backup**: Tägliche Backup-Datei in `userData/backups/` (max. 7, dann rotieren)

### 1.2 Sichtbare Fehlerbehandlung
- [x] **Toast-System**: ToastContext mit 4 Typen (success/error/warning/info)
- [x] **IPC-Fehler sichtbar machen**: `useEntityCrud` mit `onError` Callback, DataContext zeigt Toasts
- [ ] **AI-Fehler unterscheidbar machen**: "Ollama nicht erreichbar" vs. "Kein Modell geladen" — je eigene Meldung
- [ ] **Netzwerk-Fehler bei Mensa**: Statt stilles Leeren → Toast mit Retry-Button

### 1.3 Formular-Validierung
- [ ] Prüfungs-Formular: Datum Pflichtfeld, Uhrzeit format `HH:MM`, Credits als positive Zahl
- [x] Vorlesungs-Formular: Startzeit < Endzeit erzwingen
- [x] Settings: ECTS als Zahl 0–360, Ziel-GPA als Zahl 1.0–4.0

### 1.4 Lokalisierung vervollständigen
- [x] Alle hardcodierten deutschen Strings auf `t()`-Aufrufe umgestellt (OllamaSetup, Lectures-Scope-Picker)
- [x] Fehlende Übersetzungskeys in `en.json` ergänzt + pre-existierende JSON-Fehler (Smart Quotes) gefixt

**Definition of Done Phase 1:** Ein Nutzer kann die App deinstallieren, neu installieren, die Backup-Datei importieren und hat alle Daten zurück. Kein Fehler verschwindet lautlos.

---

## Phase 2 — Kern-Features vollenden

**Ziel:** Die drei Haupt-Features (Chat, Datenimport, Pomodoro) halten was sie versprechen.

### 2.1 Chat-Gedächtnis
- [x] Session-Titel: Ersten User-Message automatisch als Titel setzen
- [ ] Session-Suche: Filter-Input in der Session-Liste

### 2.2 Prüfungstermin-Import aus TUM Online
- [x] iCal-Import: ExamICalImport-Komponente mit URL-Eingabe, Vorschau, Duplikat-Erkennung
- [x] Importierte Prüfungen als reguläre Exam-Objekte angelegt

### 2.3 Moodle-Sync: Ehrlich
- [x] Fake-Sync-Button entfernt, Info-Dialog erklärt warum kein API-Zugang möglich ist
- [ ] Option B: Echte Moodle-Integration (spätere Phase)

### 2.4 Pomodoro → Todo-Verknüpfung
- [x] Study-Log-Modal: Dropdown "Prüfung oder Todo" mit Tab-Auswahl
- [x] `studylogs:getByTodo` IPC-Handler ergänzt
- [ ] Pomodoro-Sessions pro Todo im TodoDetail-Panel anzeigen

### 2.5 Onboarding-Tour reparieren
- [x] Import-Bug gefixt: `{ Joyride }` → `{ Joyride }` (korrekte Named-Export-Form)
- [x] localStorage-Key vereinheitlicht: `tourCompleted` (passt zu Settings-Reset)
- [x] `data-tour-id` Attribute in Sidebar und Dashboard vorhanden

**Definition of Done Phase 2:** Ein neuer Nutzer kann in 10 Minuten seinen echten TUM-Stundenplan + Prüfungstermine importieren, ohne eine Zeile manuell einzugeben. Der Chat erinnert sich an das Gespräch vom Vortag.

---

## Phase 3 — Verbindungen & Polish

**Ziel:** Die einzelnen Features greifen ineinander. Die App fühlt sich wie ein System an, nicht wie fünf separate Tools.

### 3.1 AI-Empfehlung → Aktion
- [ ] Empfehlungskarte bekommt kontextabhängige Action-Buttons:
  - "Jetzt Pomodoro starten" → öffnet Pomodoro-Widget
  - "Todo ansehen" → navigiert zu Todos-Page mit Highlight
  - "Lernplan für Prüfung" → öffnet Chat mit vorausgefülltem Prompt

### 3.2 Modul-Kaskade
- [x] Modul löschen → Dialog zeigt Anzahl betroffener Vorlesungsslots (mit `deleteWithLecturesBody`)
- [x] Slots sind in `module.slots` verschachtelt, werden automatisch mitgelöscht

### 3.3 Prüfung erstellen → Todo vorschlagen
- [x] `SuggestTodoModal` nach dem Anlegen einer neuen Prüfung: vorausgefüllter Titel, Datum = 3 Tage vorher

### 3.4 Performance-Grundlagen
- [ ] Lange Listen (Todos, Chat-Sessions) mit `windowing` (react-window oder einfaches Pagination) absichern
- [ ] Chat-History im State auf letzte 100 Nachrichten begrenzen (ältere nur noch persistent, nicht im Memory)

### 3.5 Noten-Export
- [x] Notenspiegel als CSV exportieren (Name, Datum, Uhrzeit, Raum, ECTS, Note, Bestanden) — Button in Exams-Page
- [ ] GPA-Zusammenfassung als letzte Zeile in Export ergänzen

**Definition of Done Phase 3:** Wenn ein Nutzer eine neue Prüfung einträgt, schlägt die App automatisch einen Lern-Todo vor und die KI-Empfehlung auf dem Dashboard führt direkt zur passenden Aktion.

---

## Nicht im Scope (bewusst ausgeschlossen)

| Feature | Begründung |
|---|---|
| Cloud-Sync / Multi-Device | Erhöht Komplexität massiv, lokale App ist das USP |
| Mobile App | Electron-First ist richtig für Studenten am Laptop |
| Kollaborations-Features | Kein Multi-User-Model geplant |
| Moodle-Abgaben verwalten | Moodle macht das selbst besser |
| Campus-Karte / Raumsuche | TUM NavigaTUM ist dafür gebaut |
| Bezahlfunktionen / SaaS | Open-Source-Projekt |

---

## Technische Schulden (parallel abarbeiten)

- `utils/helpers.js` ist ein 400+-Zeilen-Monolith mit 18 Imports — bei Gelegenheit in `date.js`, `id.js`, `links.js` aufteilen
- `src/components/modules/WeekScheduleEditor.jsx` hat hardcodierte Slot-Struktur ohne Schema-Validierung
- Kein Unit-Test-Coverage für DataContext und IPC-Bridge

---

## Zeitliche Einordnung

```
Phase 1 (Fundament)      ~1–2 Wochen   → App ist täglich nutzbar ohne Angst vor Datenverlust
Phase 2 (Kern-Features)  ~2–3 Wochen   → App erledigt den echten Job: Daten rein, KI hilft
Phase 3 (Verbindungen)   ~1–2 Wochen   → App fühlt sich wie ein System an
```

Gesamtaufwand bis shippable MVP: **ca. 4–7 Wochen** bei regelmäßiger Arbeit.
