package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"log"
	"os"
)

var testLogger = log.New(os.Stdout, "[test] ", log.LstdFlags)

func resetStore() {
	store.mu.Lock()
	store.metrics = make(map[string]*AggregatedMetric)
	store.mu.Unlock()
}

func TestHealthHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	healthHandler(testLogger)(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)

	if resp["status"] != "ok" {
		t.Fatalf("expected status ok, got %v", resp["status"])
	}
	if resp["service"] != "processor" {
		t.Fatalf("expected service processor, got %v", resp["service"])
	}
}

func TestProcessHandler(t *testing.T) {
	resetStore()
	body := ProcessRequest{
		Events: []Event{
			{ID: "1", Type: "click", Source: "web", IngestedAt: 1000},
			{ID: "2", Type: "click", Source: "web", IngestedAt: 1001},
			{ID: "3", Type: "view", Source: "mobile", IngestedAt: 1002},
		},
	}
	data, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/process", bytes.NewReader(data))
	w := httptest.NewRecorder()
	processHandler(testLogger)(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)

	if resp["processed"] != float64(3) {
		t.Fatalf("expected 3 processed, got %v", resp["processed"])
	}

	store.mu.RLock()
	if store.metrics["click"].Count != 2 {
		t.Fatalf("expected click count 2, got %d", store.metrics["click"].Count)
	}
	if store.metrics["view"].Count != 1 {
		t.Fatalf("expected view count 1, got %d", store.metrics["view"].Count)
	}
	store.mu.RUnlock()
}

func TestProcessHandlerInvalidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/process", bytes.NewReader([]byte("invalid")))
	w := httptest.NewRecorder()
	processHandler(testLogger)(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestProcessHandlerMethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/process", nil)
	w := httptest.NewRecorder()
	processHandler(testLogger)(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}
}

func TestMetricsHandler(t *testing.T) {
	resetStore()

	store.mu.Lock()
	store.metrics["click"] = &AggregatedMetric{EventType: "click", Count: 5, LastSeenAt: 1000}
	store.mu.Unlock()

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	w := httptest.NewRecorder()
	metricsHandler(testLogger)(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	metrics := resp["metrics"].([]interface{})
	if len(metrics) != 1 {
		t.Fatalf("expected 1 metric, got %d", len(metrics))
	}
}

func TestMetricsResetHandler(t *testing.T) {
	resetStore()
	store.mu.Lock()
	store.metrics["click"] = &AggregatedMetric{EventType: "click", Count: 5}
	store.metrics["view"] = &AggregatedMetric{EventType: "view", Count: 3}
	store.mu.Unlock()

	req := httptest.NewRequest(http.MethodPost, "/metrics/reset", nil)
	w := httptest.NewRecorder()
	metricsResetHandler(testLogger)(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	store.mu.RLock()
	if len(store.metrics) != 0 {
		t.Fatalf("expected empty metrics after reset, got %d", len(store.metrics))
	}
	store.mu.RUnlock()
}

func TestProcessHandlerSkipsEmptyType(t *testing.T) {
	resetStore()
	body := ProcessRequest{
		Events: []Event{
			{ID: "1", Type: "", Source: "web"},
			{ID: "2", Type: "click", Source: "web"},
		},
	}
	data, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/process", bytes.NewReader(data))
	w := httptest.NewRecorder()
	processHandler(testLogger)(w, req)

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)

	if resp["processed"] != float64(1) {
		t.Fatalf("expected 1 processed, got %v", resp["processed"])
	}
}
