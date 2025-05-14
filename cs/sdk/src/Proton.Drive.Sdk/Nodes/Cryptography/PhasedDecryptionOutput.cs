using Proton.Cryptography.Pgp;

namespace Proton.Drive.Sdk.Nodes.Cryptography;

internal readonly record struct PhasedDecryptionOutput<TData>(
    PgpSessionKey SessionKey,
    TData Data,
    AuthorshipVerificationFailure? AuthorshipVerificationFailure = null);

internal readonly record struct AuthorshipVerificationFailure(PgpVerificationStatus Status, string? Message = null);
