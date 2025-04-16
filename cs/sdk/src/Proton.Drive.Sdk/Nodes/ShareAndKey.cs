using Proton.Cryptography.Pgp;
using Proton.Drive.Sdk.Shares;

namespace Proton.Drive.Sdk.Nodes;

internal readonly record struct ShareAndKey(Share Share, PgpPrivateKey Key);
