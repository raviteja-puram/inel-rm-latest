# INEL RM

Material planning and inventory app for Raw Materials, Finished Goods, BOMs, stock, and production plans.

## Run locally

1. Install Node.js, then run `npm install` in this folder.
2. Run `npm run dev`. This starts both the Vite frontend and the API server; starting Vite alone will leave login and dashboard requests without an API.
3. Open [http://localhost:5173](http://localhost:5173).

The API uses a local SQLite database under `data/`, created on first start. Set `INEL_ADMIN_PASSWORD` before the first run to choose the initial admin password; otherwise the seeded default is `admin123`.

Use `npm test`, `npm run build`, and `npm run lint` to check the project.
