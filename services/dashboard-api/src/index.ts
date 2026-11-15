import express, { Request, Response } from "express";

const app = express();
app.use(express.json({ limit: process.env.DASHBOARD_BODY_LIMIT || "1mb" }));

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

const MAX_KEY_LENGTH = 128;

// プロトタイプを持たない辞書を使い、"__proto__" や "constructor" といった
// キー名でも素直にカウントできるようにする。
const createCounter = (): Record<string, number> =>
  Object.create(null) as Record<string, number>;

const summary: DashboardSummary = {
  totalEvents: 0,
  byType: createCounter(),
  bySource: createCounter(),
  lastUpdated: Date.now(),
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= MAX_KEY_LENGTH;

const resolveSource = (value: unknown): string =>
  isNonEmptyString(value) ? value : "unknown";

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
  let skipped = 0;
  for (const event of events) {
    if (event === null || typeof event !== "object" || !isNonEmptyString(event.type)) {
      skipped++;
      continue;
    }
    const source = resolveSource(event.source);
    summary.totalEvents++;
    summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;
    summary.bySource[source] = (summary.bySource[source] || 0) + 1;
    ingested++;
  }
  summary.lastUpdated = Date.now();

  if (skipped > 0) {
    log("WARN", `Skipped ${skipped} invalid events (missing or non-string type)`);
  }
  log("INFO", `Ingested ${ingested} events into dashboard summary`);
  res.json({ ingested, skipped });
});

app.get("/summary", (_req: Request, res: Response) => {
  log("INFO", `Returning summary: ${summary.totalEvents} total events`);
  res.json(summary);
});

app.post("/summary/reset", (_req: Request, res: Response) => {
  summary.totalEvents = 0;
  summary.byType = createCounter();
  summary.bySource = createCounter();
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
