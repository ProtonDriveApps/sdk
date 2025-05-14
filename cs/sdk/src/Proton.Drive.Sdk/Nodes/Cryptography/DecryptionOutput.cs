namespace Proton.Drive.Sdk.Nodes.Cryptography;

internal readonly record struct DecryptionOutput<TData>(TData Data, AuthorshipVerificationFailure? AuthorshipVerificationFailure = null);
