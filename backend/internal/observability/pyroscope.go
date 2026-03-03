package observability

import (
	"github.com/grafana/pyroscope-go"
	"github.com/rs/zerolog/log"
)

// InitPyroscope starts continuous profiling with Pyroscope.
// It is a no-op when serverAddr is empty, so development environments are
// not affected.
func InitPyroscope(serverAddr, appName, env string) {
	if serverAddr == "" {
		return
	}

	_, err := pyroscope.Start(pyroscope.Config{
		ApplicationName: appName,
		ServerAddress:   serverAddr,
		Tags:            map[string]string{"env": env},
		ProfileTypes: []pyroscope.ProfileType{
			pyroscope.ProfileCPU,
			pyroscope.ProfileAllocObjects,
			pyroscope.ProfileAllocSpace,
			pyroscope.ProfileInuseObjects,
			pyroscope.ProfileInuseSpace,
			pyroscope.ProfileGoroutines,
		},
	})
	if err != nil {
		log.Error().Err(err).Str("server", serverAddr).Msg("pyroscope: failed to start profiler")
		return
	}
	log.Info().Str("server", serverAddr).Str("app", appName).Msg("pyroscope: continuous profiling started")
}
