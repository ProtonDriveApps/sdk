using Proton.Cryptography.Pgp;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal readonly record struct PhasedDecryptionOutput<TData>(PgpSessionKey SessionKey, TData Data, Result<Author, SignatureVerificationError> Author);
