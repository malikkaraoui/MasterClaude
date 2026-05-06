// Package dashboard expose le handler HTTP de la WebUI minimaliste.
// L'HTML est embarqué dans le binaire via go:embed.
package dashboard

import (
	_ "embed"
	"net/http"
)

//go:embed index.html
var indexHTML []byte

// Handler retourne un http.Handler qui sert le dashboard.
func Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(indexHTML)
	})
}
