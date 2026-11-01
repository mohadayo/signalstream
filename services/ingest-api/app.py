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


def _int_env(name: str, default: int) -> int:
    try:
        value = int(os.environ.get(name, default))
    except ValueError:
        logger.warning("Invalid %s, falling back to %d", name, default)
        return default
    return value if value > 0 else default


# メモリ使用量が際限なく増えないよう、保持するイベント数の上限を環境変数で設定可能にする
MAX_EVENTS = _int_env("MAX_EVENTS", 10000)

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

    if not isinstance(body, dict):
        logger.warning("Received JSON body that is not an object")
        return jsonify({"error": "Request body must be a JSON object"}), 400

    if "type" not in body:
        logger.warning("Received event without 'type' field")
        return jsonify({"error": "Field 'type' is required"}), 400

    if not isinstance(body["type"], str) or not body["type"].strip():
        logger.warning("Received event with invalid 'type' field")
        return jsonify({"error": "Field 'type' must be a non-empty string"}), 400

    if not isinstance(body.get("payload", {}), dict):
        logger.warning("Received event with non-object 'payload'")
        return jsonify({"error": "Field 'payload' must be an object"}), 400

    source = body.get("source", "unknown")
    if not isinstance(source, str) or not source.strip():
        logger.warning("Received event with invalid 'source' field")
        return jsonify({"error": "Field 'source' must be a non-empty string"}), 400

    event = {
        "id": str(uuid.uuid4()),
        "type": body["type"],
        "payload": body.get("payload", {}),
        "source": source,
        "ingested_at": time.time(),
    }
    events_store.append(event)
    if len(events_store) > MAX_EVENTS:
        dropped = len(events_store) - MAX_EVENTS
        del events_store[:dropped]
        logger.warning("Event store exceeded MAX_EVENTS=%d, dropped %d oldest event(s)", MAX_EVENTS, dropped)
    logger.info("Ingested event id=%s type=%s source=%s", event["id"], event["type"], event["source"])
    return jsonify(event), 201


@app.route("/events", methods=["GET"])
def list_events():
    event_type = request.args.get("type")
    source = request.args.get("source")
    raw_limit = request.args.get("limit", "100")
    try:
        limit = int(raw_limit)
    except ValueError:
        limit = 0
    if limit < 1:
        logger.warning("Invalid limit parameter: %r", raw_limit)
        return jsonify({"error": "Query parameter 'limit' must be a positive integer"}), 400

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
