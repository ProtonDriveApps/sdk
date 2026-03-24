package protondrive

import "errors"

var (
	// ErrInvalidLogin is returned when login options are missing required fields.
	ErrInvalidLogin = errors.New("invalid proton drive login options")

	// ErrInvalidSession is returned when session-resume options contain an
	// incomplete or empty session.
	ErrInvalidSession = errors.New("invalid proton drive session")

	// ErrNotAuthenticated is returned when an operation is attempted on a client
	// that has not been authenticated.
	ErrNotAuthenticated = errors.New("proton drive client is not authenticated")

	// ErrUnknownSizeUpload is returned when an upload is requested without a
	// known file size. Proton Drive requires the size to be known upfront.
	ErrUnknownSizeUpload = errors.New("proton drive requires a known upload size")

	// ErrMissingCredentialsFile is returned when the integration test
	// credentials file cannot be found.
	ErrMissingCredentialsFile = errors.New("missing proton drive integration credentials file")
)
