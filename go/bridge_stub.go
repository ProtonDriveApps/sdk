//go:build !protonbridge

package protondrive

import "context"

func NewBridgeDialer() Dialer {
	return unavailableBridgeDialer{}
}

type unavailableBridgeDialer struct{}

func (unavailableBridgeDialer) Login(_ context.Context, _ LoginOptions, _ SessionHooks) (Driver, error) {
	return nil, ErrBridgeDialerUnavailable
}

func (unavailableBridgeDialer) Resume(_ context.Context, _ ResumeOptions, _ SessionHooks) (Driver, error) {
	return nil, ErrBridgeDialerUnavailable
}
