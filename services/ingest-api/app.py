import logging
import os
import time
import uuid
from flask import Flask, request, jsonify

app = Flask(__name__)

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ingest-api")

events_store: list[dict] = []


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "ingest-api", "timestamp": time.time()})


@app.route("/events", methods=["POST"])
def ingest_event():
    body = request.get_json(silent=True)
    if body is None:
        logger.warning("Received request with invalid JSON body")
        return jsonify({"error": "Request body must be valid JSON"}), 400

    if "type" not in body:
        logger.warning("Received event without 'type' field")
        return jsonify({"error": "Field 'type' is required"}), 400

    event = {
        "id": str(uuid.uuid4()),
        "type": body["type"],
        "payload": body.get("payload", {}),
        "source": body.get("source", "unknown"),
        "ingested_at": time.time(),
    }
    events_store.append(event)
    logger.info("Ingested event id=%s type=%s source=%s", event["id"], event["type"], event["source"])
    return jsonify(event), 201


@app.route("/events", methods=["GET"])
def list_events():
    event_type = request.args.get("type")
    source = request.args.get("source")
    limit = request.args.get("limit", default=100, type=int)

    results = events_store
    if event_type:
        results = [e for e in results if e["type"] == event_type]
    if source:
        results = [e for e in results if e["source"] == source]

    results = results[-limit:]
    logger.info("Listed %d events (type=%s, source=%s)", len(results), event_type, source)
    return jsonify({"events": results, "count": len(results)})


@app.route("/events", methods=["DELETE"])
def clear_events():
    count = len(events_store)
    events_store.clear()
    logger.info("Cleared %d events", count)
    return jsonify({"cleared": count})


def create_app():
    return app


if __name__ == "__main__":
    port = int(os.environ.get("INGEST_PORT", "8001"))
    logger.info("Starting ingest-api on port %d", port)
    app.run(host="0.0.0.0", port=port)
