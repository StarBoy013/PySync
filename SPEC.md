# PySync — Real-Time Collaborative Python IDE (Driver–Navigator)

Final-year major project. **Runs locally only** (laptop = host; other devices join over LAN). Deployment is a future phase.

## 0. Rules for the AI agent (read first)

1. **The server is authoritative.** Never trust client state for the lock. Reject any `code-change` where `socket.id !== rooms[roomId].driverSocketId`.
2. Verify the JWT in the Socket.io handshake (`io.use`) and on every REST route except register/login.
3. Never hardcode `localhost` in the client. Derive the server URL: `import.meta.env.VITE_SERVER_URL || \`http://${window.location.hostname}:5000\``. This is what makes phone access work.
4. Code execution goes only through `server/executor.js` (`runCode(code, stdin)`). No other file may spawn processes.
5. Keystrokes travel over Socket.io only. MongoDB is written on Save or Run only.
6. Build one phase at a time. After each phase, write a manual test checklist and stop.

## 1. Overview

Browser-based real-time collaborative Python IDE. One **Driver** edits at a time; everyone else is a **Navigator** (read-only) who see the Driver's code live, chat, and see run output. A mutex lock prevents merge conflicts.

**Stack:** React (Vite) + Tailwind, `@monaco-editor/react`, Node + Express, Socket.io, MongoDB + Mongoose, JWT + bcryptjs, Node `child_process` for execution.

## 2. Architecture

```
Browser(s) ──REST──► Express ──► MongoDB
     │                  │
     └──Socket.io──────►│──► rooms (in-memory Map)
                        └──► executor.js ──► python3 (spawn, timeout)
```

In-memory room state (server):
```js
rooms[roomId] = {
  code: String,                 // latest code, served to late joiners
  driverSocketId: String,
  users: Map<socketId, { userId, username, color }>,
  graceTimer: Timeout | null    // disconnect grace
}
```

## 3. Core features

### 3.1 Driver–Navigator lock
- Driver: Monaco `readOnly: false`. Navigators: `readOnly: true`.
- Events: `request-control` (Navigator → Server → Driver), `grant-control` / `release-control` (Driver → Server → Room).
- Driver may release voluntarily or approve a request. Server updates `driverSocketId` and broadcasts `driver-changed`.
- Toasts: "Rahul took editing control".
- **Disconnect:** start a 4s grace timer. If the same user rejoins in time, cancel it. Otherwise assign Driver to the next user in `users`. If the room is empty, delete it after saving.

### 3.2 User colors (no cursor sync)
- On join, the server assigns each user a color from a fixed palette.
- Colors appear in the users list, chat messages, toasts, and a "Driver" badge.
- Live cursor sync is **out of scope**. Optional Week 5 stretch: highlight the Driver's current line for Navigators (`driver-line` event, one Monaco decoration).

### 3.3 Python execution with stdin
- Client emits `run-code { code, stdin }` over the socket. Server runs `runCode`, then broadcasts `run-output { stdout, stderr, exitCode, ranBy }` to the room so everyone sees the terminal.
- `executor.js`: write code to a temp file → `spawn('python3' | 'python', [file])` → pipe stdin, then close it → kill after 5s → cap output at ~64KB → delete the temp file. Use `os.platform()` to pick the binary.
- Only the Driver may run? Decision: **any member may run** (Navigators often want to test). Rate limit to 1 run per 2s per room.
- Keep the executor swappable. Future: Docker-sandboxed Piston or Judge0.
- Known limitation (state in the report): host execution is unsandboxed; fine for local demo, not for production.

### 3.4 Late joiners
- On `join-room`, send `room-state { code, driverSocketId, users }` from memory. If the room does not exist in memory, load `project.code` from MongoDB and create it.

### 3.5 Smart saving
- MongoDB write only on **Save** and on **Run** (debounced). Also save when the room becomes empty.

### 3.6 Utilities
- Chat sidebar (`send-message` → `receive-message`).
- Download `main.py` via Blob.
- Online users list with colors and a Driver badge.

## 4. Database

```js
User:    { _id, username, email, passwordHash, createdAt }
Project: { _id, roomId (unique, short UUID), projectName, ownerId→User,
           code, language: "python", updatedAt }
```

## 5. Socket events

| Event | Direction | Notes |
|---|---|---|
| join-room | C→S | handshake JWT identifies the user; server replies `room-state` |
| user-joined / user-left | S→Room | updates users list |
| code-change | Driver→S→Navigators | **server rejects if sender is not driver** |
| request-control | Nav→S→Driver | |
| grant-control / release-control | Driver→S→Room | emits `driver-changed` |
| run-code | Any→S | server executes |
| run-output | S→Room | terminal output for everyone |
| send-message / receive-message | C→S→Room | chat |
| disconnect | System→S | grace timer, then reassign Driver |

## 6. REST API
- `POST /api/auth/register`, `POST /api/auth/login`
- `POST /api/projects` (create → generates `roomId`), `GET /api/projects` (mine), `GET /api/projects/:roomId`, `PUT /api/projects/:roomId` (save)

## 7. Local and LAN setup
- Run MongoDB locally (or Atlas free tier).
- Server: `listen(5000, '0.0.0.0')`. Client: `vite --host`.
- Phone and laptop on the **same Wi-Fi**. Open `http://<laptop-LAN-IP>:5173` on the phone (find the IP with `ipconfig` / `ifconfig`).
- Allow Node/Vite through the OS firewall (Windows prompts on first run; choose Private networks).
- CORS: allow origin `http://<laptop-LAN-IP>:5173` (in dev, a reflective origin is acceptable).
- This is not port forwarding. It only works on the same network, which is all you need.
- **Phone caveat:** Monaco has weak touch and soft-keyboard support. The phone works well as a **Navigator** (watching live code, chat, output). Editing as Driver on a phone is clunky. Demo plan: laptop = Driver, phone = Navigator, then use a second laptop browser tab or window for the handover demo. Optional: a plain `<textarea>` fallback editor on mobile.

## 8. Roadmap (4–5 weeks, solo)
1. **Week 1 — Foundation:** repo (`/client`, `/server`), Mongo models, auth APIs, Login/Register/Dashboard (Create room, Enter Room ID).
2. **Week 2 — IDE + execution:** 3-column layout (users and lock | Monaco | output, stdin, chat), `executor.js`, Run, Download.
3. **Week 3 — Real-time:** Socket.io with JWT handshake, `join-room`, `room-state`, `code-change`, chat, user colors.
4. **Week 4 — Lock + persistence:** server-authoritative lock, request/grant flow, disconnect grace, Save, toasts, LAN test with phone.
5. **Week 5 — Hardening and report:** edge cases (refresh, Wi-Fi drop, infinite loop, bad syntax, 3+ users), rate limits, report, PPT, viva prep.

## 9. Test checklist (must pass)
- Navigator cannot change code even by forging a `code-change` event.
- Refresh as Driver within 4s keeps the Driver role. Closing the tab hands control to the next user.
- `while True: pass` is killed at 5s and reported.
- `input()` reads from the Custom Input box.
- A late joiner sees current code immediately.
- Phone on LAN joins, sees live code, and can chat.
- Keystrokes cause zero MongoDB writes.

## 10. Viva talking points
- Why a lock (Driver–Navigator) and not CRDT/OT? Simpler, no merge conflicts, matches the pair-programming pedagogy. Name Yjs as the alternative.
- Why is the server authoritative? Client-side `readOnly` is cosmetic.
- Why in-memory rooms? Speed. For scale, use Redis and the Socket.io Redis adapter.
- Why is the executor swappable? Host execution is unsafe in production; sandboxed Piston/Judge0 is the planned upgrade.

## 11. Future work
Deployment (Render + Vercel + Atlas), sandboxed execution, multi-file projects, voice chat.
