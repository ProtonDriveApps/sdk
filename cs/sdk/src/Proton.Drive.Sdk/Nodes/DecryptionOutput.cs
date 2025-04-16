using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal readonly record struct DecryptionOutput<TData>(TData Data, Result<Author, SignatureVerificationError> Author)
{
    public static implicit operator DecryptionOutput<TData>?((TData Data, Result<Author, SignatureVerificationError> Author) output)
    {
        return new DecryptionOutput<TData>(output.Data, output.Author);
    }
}
