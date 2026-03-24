package protondrive

import "context"

func NewDialer() Dialer {
	return &dialer{}
}

type dialer struct{}

func (d *dialer) Login(ctx context.Context, options LoginOptions, hooks SessionHooks) (Driver, error) {
	return newStandaloneDriver(loginSessionFromOptions(options), hooks), nil
}

func (d *dialer) Resume(ctx context.Context, options ResumeOptions, hooks SessionHooks) (Driver, error) {
	return newStandaloneDriver(options.Session, hooks), nil
}
