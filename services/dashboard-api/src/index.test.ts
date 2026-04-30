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
