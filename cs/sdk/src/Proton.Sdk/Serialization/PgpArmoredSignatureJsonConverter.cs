using Proton.Cryptography.Pgp;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Serialization;

internal sealed class PgpArmoredSignatureJsonConverter : PgpArmoredBlockJsonConverterBase<PgpArmoredSignature>
{
    protected override PgpBlockType BlockType => PgpBlockType.Signature;

    protected override PgpArmoredSignature CreateValue(ReadOnlyMemory<byte> bytes) => new(bytes);
}
