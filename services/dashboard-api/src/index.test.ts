import request from "supertest";
import app from "./index";

beforeEach(async () => {
  await request(app).post("/summary/reset");
});

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("dashboard-api");
    expect(res.body.timestamp).toBeDefined();
  });
});

describe("POST /ingest", () => {
  it("ingests events and updates summary", async () => {
    const res = await request(app)
      .post("/ingest")
      .send({
        events: [
          { id: "1", type: "click", source: "web", payload: {}, ingested_at: 1000 },
          { id: "2", type: "view", source: "mobile", payload: {}, ingested_at: 1001 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.ingested).toBe(2);
  });

  it("rejects non-array events", async () => {
    const res = await request(app).post("/ingest").send({ events: "bad" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("array");
  });

  it("skips events without type", async () => {
    const res = await request(app)
      .post("/ingest")
      .send({
        events: [
          { id: "1", type: "", source: "web", payload: {}, ingested_at: 1000 },
          { id: "2", type: "click", source: "web", payload: {}, ingested_at: 1001 },
        ],
      });
    expect(res.body.ingested).toBe(1);
  });
});

describe("POST /ingest input validation", () => {
  it("skips null and non-object events instead of returning 500", async () => {
    const res = await request(app)
      .post("/ingest")
      .send({ events: [null, 42, "click", { id: "1", type: "click", source: "web" }] });
    expect(res.status).toBe(200);
    expect(res.body.ingested).toBe(1);
    expect(res.body.skipped).toBe(3);
  });

  it("skips events whose type is not a string", async () => {
    const res = await request(app)
      .post("/ingest")
      .send({
        events: [
          { id: "1", type: 123, source: "web" },
          { id: "2", type: { nested: true }, source: "web" },
          { id: "3", type: "   ", source: "web" },
          { id: "4", type: "x".repeat(129), source: "web" },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.ingested).toBe(0);
    expect(res.body.skipped).toBe(4);
    const summaryRes = await request(app).get("/summary");
    expect(summaryRes.body.totalEvents).toBe(0);
  });

  it("falls back to 'unknown' for non-string source", async () => {
    await request(app)
      .post("/ingest")
      .send({ events: [{ id: "1", type: "click", source: 99 }, { id: "2", type: "click" }] });
    const res = await request(app).get("/summary");
    expect(res.body.bySource.unknown).toBe(2);
  });

  it("counts prototype-like keys correctly", async () => {
    await request(app)
      .post("/ingest")
      .send({
        events: [
          { id: "1", type: "constructor", source: "__proto__" },
          { id: "2", type: "constructor", source: "__proto__" },
          { id: "3", type: "toString", source: "web" },
        ],
      });
    const res = await request(app).get("/summary");
    expect(res.body.totalEvents).toBe(3);
    expect(res.body.byType.constructor).toBe(2);
    expect(res.body.byType.toString).toBe(1);
    expect(res.body.bySource.web).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("GET /summary", () => {
  it("returns aggregated summary", async () => {
    await request(app)
      .post("/ingest")
      .send({
        events: [
          { id: "1", type: "click", source: "web", payload: {}, ingested_at: 1000 },
          { id: "2", type: "click", source: "web", payload: {}, ingested_at: 1001 },
          { id: "3", type: "view", source: "mobile", payload: {}, ingested_at: 1002 },
        ],
      });

    const res = await request(app).get("/summary");
    expect(res.status).toBe(200);
    expect(res.body.totalEvents).toBe(3);
    expect(res.body.byType.click).toBe(2);
    expect(res.body.byType.view).toBe(1);
    expect(res.body.bySource.web).toBe(2);
    expect(res.body.bySource.mobile).toBe(1);
  });
});

describe("POST /summary/reset", () => {
  it("resets the summary", async () => {
    await request(app)
      .post("/ingest")
      .send({ events: [{ id: "1", type: "click", source: "web", payload: {}, ingested_at: 1000 }] });

    const resetRes = await request(app).post("/summary/reset");
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.reset).toBe(true);

    const summaryRes = await request(app).get("/summary");
    expect(summaryRes.body.totalEvents).toBe(0);
  });
});
