package protondrive

import "errors"

var (
	ErrInvalidLogin            = errors.New("invalid proton drive login options")
	ErrInvalidSession          = errors.New("invalid proton drive session")
	ErrNotAuthenticated        = errors.New("proton drive client is not authenticated")
	ErrUnknownSizeUpload       = errors.New("proton drive requires a known upload size")
	ErrNotImplemented          = errors.New("proton drive operation not yet implemented")
	ErrBridgeDialerUnavailable = errors.New("bridge-backed dialer requires the protonbridge build tag and bridge dependencies")
)
