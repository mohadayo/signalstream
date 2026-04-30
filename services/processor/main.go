package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

type AggregatedMetric struct {
	EventType  string  `json:"event_type"`
	Count      int64   `json:"count"`
	LastSeenAt float64 `json:"last_seen_at"`
}

type ProcessRequest struct {
	Events []Event `json:"events"`
}

type Event struct {
	ID         string                 `json:"id"`
	Type       string                 `json:"type"`
	Payload    map[string]interface{} `json:"payload"`
	Source     string                 `json:"source"`
	IngestedAt float64               `json:"ingested_at"`
}

type MetricsStore struct {
	mu      sync.RWMutex
	metrics map[string]*AggregatedMetric
}

var store = &MetricsStore{
	metrics: make(map[string]*AggregatedMetric),
}

func main() {
	logger := log.New(os.Stdout, "[processor] ", log.LstdFlags)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler(logger))
	mux.HandleFunc("/process", processHandler(logger))
	mux.HandleFunc("/metrics", metricsHandler(logger))
	mux.HandleFunc("/metrics/reset", metricsResetHandler(logger))

	port := os.Getenv("PROCESSOR_PORT")
	if port == "" {
		port = "8002"
	}

	logger.Printf("Starting processor on port %s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		logger.Fatalf("Server failed: %v", err)
	}
}

func healthHandler(logger *log.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":    "ok",
			"service":   "processor",
			"timestamp": time.Now().Unix(),
		})
	}
}

func processHandler(logger *log.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
			return
		}

		var req ProcessRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			logger.Printf("Invalid request body: %v", err)
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
			return
		}

		processed := 0
		store.mu.Lock()
		for _, event := range req.Events {
			if event.Type == "" {
				continue
			}
			m, ok := store.metrics[event.Type]
			if !ok {
				m = &AggregatedMetric{EventType: event.Type}
				store.metrics[event.Type] = m
			}
			m.Count++
			m.LastSeenAt = event.IngestedAt
			processed++
		}
		store.mu.Unlock()

		logger.Printf("Processed %d events", processed)
		writeJSON(w, http.StatusOK, map[string]interface{}{"processed": processed})
	}
}

func metricsHandler(logger *log.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
			return
		}

		store.mu.RLock()
		result := make([]*AggregatedMetric, 0, len(store.metrics))
		for _, m := range store.metrics {
			result = append(result, m)
		}
		store.mu.RUnlock()

		logger.Printf("Returning %d metrics", len(result))
		writeJSON(w, http.StatusOK, map[string]interface{}{"metrics": result})
	}
}

func metricsResetHandler(logger *log.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
			return
		}

		store.mu.Lock()
		count := len(store.metrics)
		store.metrics = make(map[string]*AggregatedMetric)
		store.mu.Unlock()

		logger.Printf("Reset %d metrics", count)
		writeJSON(w, http.StatusOK, map[string]interface{}{"reset": count})
	}
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
