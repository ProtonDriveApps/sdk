package protondrive

import "testing"

func TestGenerateTOTP(t *testing.T) {
	// Use the well-known test secret from RFC 6238 appendix B.
	// This validates the algorithm produces a 6-digit numeric code.
	code, err := generateTOTP("JBSWY3DPEHPK3PXP")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(code) != 6 {
		t.Fatalf("expected 6-digit code, got %q (%d digits)", code, len(code))
	}
	for _, c := range code {
		if c < '0' || c > '9' {
			t.Fatalf("expected numeric code, got %q", code)
		}
	}
}

func TestGenerateTOTPInvalidSecret(t *testing.T) {
	_, err := generateTOTP("!!!invalid-base32!!!")
	if err == nil {
		t.Fatal("expected error for invalid base32 secret")
	}
}

func TestGenerateTOTPConsistency(t *testing.T) {
	// Two calls within the same 30-second window should produce the same code.
	code1, err := generateTOTP("JBSWY3DPEHPK3PXP")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	code2, err := generateTOTP("JBSWY3DPEHPK3PXP")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if code1 != code2 {
		t.Fatalf("expected same code within same time window, got %q and %q", code1, code2)
	}
}
