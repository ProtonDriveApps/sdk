using Proton.Cryptography.Pgp;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Serialization;

internal sealed class PgpArmoredSecretKeyJsonConverter : PgpArmoredBlockJsonConverterBase<PgpArmoredSecretKey>
{
    protected override PgpBlockType BlockType => PgpBlockType.PrivateKey;

    protected override PgpArmoredSecretKey CreateValue(ReadOnlyMemory<byte> bytes) => new(PgpSecretKey.Import(bytes.Span));
}
