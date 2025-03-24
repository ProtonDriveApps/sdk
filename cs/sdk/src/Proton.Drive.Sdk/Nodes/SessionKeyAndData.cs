using Proton.Cryptography.Pgp;
using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal readonly record struct SessionKeyAndData<TData>(
    PgpSessionKey SessionKey,
    Result<(TData Data, Result<Author, SignatureVerificationError> Author), DecryptionError> DataDecryptionResult);
