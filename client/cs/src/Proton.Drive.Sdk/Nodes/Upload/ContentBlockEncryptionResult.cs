using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Nodes.Upload;

internal readonly record struct ContentBlockEncryptionResult(
    Stream EncryptedContentStream,
    byte[] Sha256Digest,
    PgpArmoredMessage EncryptedSignature);
