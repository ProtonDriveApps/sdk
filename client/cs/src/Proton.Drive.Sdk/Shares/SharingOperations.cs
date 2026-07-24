using System.Runtime.CompilerServices;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Shares;

internal static class SharingOperations
{
    public static async IAsyncEnumerable<NodeUid> EnumerateSharedNodeUidsAsync(
        ProtonDriveClient client,
        Func<ProtonDriveClient, CancellationToken, ValueTask<VolumeId?>> resolveVolumeId,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var volumeId = await resolveVolumeId(client, cancellationToken).ConfigureAwait(false);
        if (volumeId is null)
        {
            // Nothing to enumerate if the volume doesn't exist.
            yield break;
        }

        var anchorId = default(LinkId?);
        var mustTryMoreResults = true;

        while (mustTryMoreResults)
        {
            var response = await client.Api.Shares.GetSharedByMeAsync(volumeId.Value, anchorId, cancellationToken).ConfigureAwait(false);

            foreach (var link in response.Links)
            {
                yield return new NodeUid(volumeId.Value, link.LinkId);
            }

            anchorId = response.AnchorId;
            mustTryMoreResults = response.More && anchorId is not null;
        }
    }

    public static async IAsyncEnumerable<NodeUid> EnumerateSharedWithMeNodeUidsAsync(
        ProtonDriveClient client,
        IReadOnlyCollection<ShareTargetType> shareTargetTypes,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var anchorId = default(LinkId?);
        var mustTryMoreResults = true;

        while (mustTryMoreResults)
        {
            var response = await client.Api.Shares.GetSharedWithMeAsync(anchorId, cancellationToken).ConfigureAwait(false);

            foreach (var link in response.Links)
            {
                if (!shareTargetTypes.Contains(link.ShareTargetType))
                {
                    continue;
                }

                yield return new NodeUid(link.VolumeId, link.LinkId);
            }

            anchorId = response.AnchorId;
            mustTryMoreResults = response.More && anchorId is not null;
        }
    }

    public static async ValueTask LeaveSharedNodeAsync(ProtonDriveClient client, NodeUid nodeUid, CancellationToken cancellationToken)
    {
        var response = await client.Api.Links.GetDetailsAsync(nodeUid.VolumeId, [nodeUid.LinkId], cancellationToken).ConfigureAwait(false);

        var linkDetails = response.Links.FirstOrDefault(link => link.Link.Id == nodeUid.LinkId);

        if (linkDetails?.Membership is not { } membership)
        {
            throw new ValidationException("You can leave only an item that is shared with you");
        }

        await client.Api.Shares.RemoveMemberAsync(membership.ShareId, membership.MembershipId, cancellationToken).ConfigureAwait(false);
    }
}
