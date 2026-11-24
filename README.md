# PySync

PySync is a local, real-time collaborative Python IDE.

## Setup

1. Install MongoDB and ensure it is running.
2. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` and `JWT_SECRET`.
3. Install and run the server and client:

```powershell
cd server
npm install
npm run dev
```

```powershell
cd client
npm install
npm run dev
```

Open `http://localhost:5173`.

## Environment variables

Server `server/.env`:
- `PORT=5000`
- `MONGODB_URI=mongodb://127.0.0.1:27017/pysync`
- `JWT_SECRET` - use a long random secret
- `CLIENT_URL=http://localhost:5173`

Client `client/.env`:
- `VITE_SERVER_URL=http://<laptop-LAN-IP>:5000` (optional)

If `VITE_SERVER_URL` is unset, the client derives `http://<current-hostname>:5000`.

## LAN setup

1. Start MongoDB, the server, and Vite with `npm run dev`.
2. Find the laptop LAN IP with `ipconfig`.
3. Allow Node and Vite through the Windows firewall for private networks.
4. On the same Wi-Fi, open `http://<laptop-LAN-IP>:5173`.
5. The Node server listens on `0.0.0.0:5000`, and Vite listens on all interfaces.

Port forwarding is not required. LAN access only works on the same network.

## Known limitations

- Python runs unsandboxed on the host machine through `python` or `python3`; it is intended for a trusted local demo.
- Room state is held in memory. Restarting the server loses unsaved room state, although MongoDB retains saved and run-saved projects.
- No live cursor synchronization is implemented.
- Monaco is less convenient on touch devices; Navigator mode is the best phone experience.
