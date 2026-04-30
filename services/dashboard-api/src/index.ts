import express, { Request, Response } from "express";

const app = express();
app.use(express.json());

interface DashboardSummary {
  totalEvents: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  lastUpdated: number;
}

interface EventInput {
  id: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  ingested_at: number;
}

const summary: DashboardSummary = {
  totalEvents: 0,
  byType: {},
  bySource: {},
  lastUpdated: Date.now(),
};

const log = (level: string, message: string): void => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} [${level}] dashboard-api: ${message}`);
};

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "dashboard-api", timestamp: Date.now() });
});

app.post("/ingest", (req: Request, res: Response) => {
  const events: EventInput[] = req.body?.events;
  if (!Array.isArray(events)) {
    log("WARN", "Received ingest request with invalid events array");
    res.status(400).json({ error: "Field 'events' must be an array" });
    return;
  }

  let ingested = 0;
  for (const event of events) {
    if (!event.type) continue;
    summary.totalEvents++;
    summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;
    summary.bySource[event.source || "unknown"] =
      (summary.bySource[event.source || "unknown"] || 0) + 1;
    ingested++;
  }
  summary.lastUpdated = Date.now();

  log("INFO", `Ingested ${ingested} events into dashboard summary`);
  res.json({ ingested });
});

app.get("/summary", (_req: Request, res: Response) => {
  log("INFO", `Returning summary: ${summary.totalEvents} total events`);
  res.json(summary);
});

app.post("/summary/reset", (_req: Request, res: Response) => {
  summary.totalEvents = 0;
  summary.byType = {};
  summary.bySource = {};
  summary.lastUpdated = Date.now();
  log("INFO", "Dashboard summary reset");
  res.json({ reset: true });
});

export function createApp() {
  return app;
}

if (require.main === module) {
  const port = parseInt(process.env.DASHBOARD_PORT || "8003", 10);
  app.listen(port, "0.0.0.0", () => {
    log("INFO", `Starting dashboard-api on port ${port}`);
  });
}

export default app;
