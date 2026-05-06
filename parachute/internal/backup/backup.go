// Package backup implémente le backup automatique quotidien du dataDir.
// Crée un tar.gz dans dataDir/backups/YYYYMMDD.tar.gz, conserve 7 jours.
package backup

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// RunDaily bloque jusqu'à ctx.Done(), crée un backup à minuit chaque jour.
func RunDaily(ctx context.Context, dataDir string) {
	backupDir := filepath.Join(dataDir, "backups")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		slog.Error("backup: créer backupDir", "err", err)
		return
	}

	for {
		now := time.Now()
		next := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 30, 0, now.Location())
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}

		stamp := time.Now().Format("20060102")
		out := filepath.Join(backupDir, stamp+".tar.gz")
		if err := createTarGz(out, dataDir, backupDir); err != nil {
			slog.Error("backup: créer archive", "file", out, "err", err)
		} else {
			slog.Info("backup: archive créée", "file", out)
		}
		pruneOld(backupDir, 7)
	}
}

// createTarGz crée un tar.gz de src (en excluant excludeDir).
func createTarGz(dst, src, excludeDir string) error {
	f, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("créer %s: %w", dst, err)
	}
	defer f.Close()

	gz := gzip.NewWriter(f)
	defer gz.Close()
	tw := tar.NewWriter(gz)
	defer tw.Close()

	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		// Exclure le répertoire backups lui-même.
		if info.IsDir() && path == excludeDir {
			return filepath.SkipDir
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		hdr := &tar.Header{
			Name:    rel,
			Size:    info.Size(),
			Mode:    int64(info.Mode()),
			ModTime: info.ModTime(),
		}
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		r, err := os.Open(path)
		if err != nil {
			return err
		}
		defer r.Close()
		_, err = io.Copy(tw, r)
		return err
	})
}

// pruneOld supprime les archives au-delà des N plus récentes.
func pruneOld(dir string, keep int) {
	entries, err := filepath.Glob(filepath.Join(dir, "*.tar.gz"))
	if err != nil || len(entries) <= keep {
		return
	}
	sort.Strings(entries)
	for _, old := range entries[:len(entries)-keep] {
		if err := os.Remove(old); err == nil {
			slog.Info("backup: archive supprimée", "file", old)
		}
	}
}
