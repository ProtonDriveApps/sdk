using System.Collections.Concurrent;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Search.Abstractions;
using ProtonDriveNodeMetadata = Proton.Drive.Sdk.Nodes.NodeMetadata;
using ProtonDriveNodeUid = Proton.Drive.Sdk.Nodes.NodeUid;
using SearchNodeUid = Proton.Drive.Sdk.Search.NodeUid;

namespace Proton.Drive.Sdk.Search;

internal sealed class ProtonDriveClientAdapter(ProtonDriveClient client) : DriveSdkClient
{
    private const int DefaultBatchSize = 50;

    private readonly ProtonDriveClient _client = client;
    private readonly ConcurrentDictionary<ulong, NodeStreamState> _streams = new();
    private ulong _nextStreamId;

    public Task<StreamToken> OpenNodeStream(SearchNodeUid[] nodeUids)
    {
        try
        {
            var pending = new Queue<ProtonDriveNodeUid>(nodeUids.Length);
            foreach (var nodeUid in nodeUids)
            {
                if (!SearchNodeUidMapping.TryParseProtonDriveNodeUid(nodeUid, out var parsedUid))
                {
                    throw new DriveSdkClientErrorException(new DriveSdkClientError.InvalidNode(nodeUid));
                }

                pending.Enqueue(parsedUid);
            }

            var streamId = Interlocked.Increment(ref _nextStreamId);
            _streams[streamId] = new NodeStreamState(pending);
            return Task.FromResult(new StreamToken(streamId));
        }
        catch (DriveSdkClientErrorException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new DriveSdkClientErrorException(SearchExceptionMapper.ToDriveSdkError(exception));
        }
    }

    public async Task<Node?> NextNode(StreamToken token)
    {
        if (!_streams.TryGetValue(token.Id, out var state))
        {
            throw new DriveSdkClientErrorException(new DriveSdkClientError.IterationFailed("Unknown stream token."));
        }

        try
        {
            return await ReadNextNodeAsync(state).ConfigureAwait(false);
        }
        catch (DriveSdkClientErrorException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new DriveSdkClientErrorException(SearchExceptionMapper.ToDriveSdkError(exception));
        }
    }

    public async Task<Node[]?> NextNodeBatch(StreamToken token)
    {
        if (!_streams.TryGetValue(token.Id, out var state))
        {
            throw new DriveSdkClientErrorException(new DriveSdkClientError.IterationFailed("Unknown stream token."));
        }

        try
        {
            var batch = new List<Node>(DefaultBatchSize);
            for (var i = 0; i < DefaultBatchSize; i++)
            {
                var node = await ReadNextNodeAsync(state).ConfigureAwait(false);
                if (node is null)
                {
                    break;
                }

                batch.Add(node.Value);
            }

            return batch.Count == 0 ? null : [.. batch];
        }
        catch (DriveSdkClientErrorException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new DriveSdkClientErrorException(SearchExceptionMapper.ToDriveSdkError(exception));
        }
    }

    public void CloseNodeStream(StreamToken token)
    {
        _streams.TryRemove(token.Id, out _);
    }

    private async Task<Node?> ReadNextNodeAsync(NodeStreamState state)
    {
        if (!state.Pending.TryDequeue(out var nodeUid))
        {
            return null;
        }

        var metadata = await FetchNodeMetadataAsync(nodeUid).ConfigureAwait(false);
        return Node.New(SearchNodeMapper.ToFfiNode(metadata));
    }

    private async Task<ProtonDriveNodeMetadata> FetchNodeMetadataAsync(ProtonDriveNodeUid nodeUid)
    {
        var nodeMetadataResults = _client.NodeProvider.EnumerateNodeMetadataAsync(
            nodeUid.VolumeId,
            [(nodeUid.LinkId, nodeUid.LinkId)],
            CancellationToken.None).ConfigureAwait(false);

        await foreach (var (_, result) in nodeMetadataResults)
        {
            if (!result.TryGetValueElseError(out var metadata, out var error))
            {
                if (error is NodeNotFoundException)
                {
                    throw SearchNodeProviderException.ForInvalidNode(nodeUid.ToString());
                }

                throw new SearchNodeProviderException(error.Message, error);
            }

            return metadata;
        }

        throw SearchNodeProviderException.ForInvalidNode(nodeUid.ToString());
    }

    private sealed class NodeStreamState(Queue<ProtonDriveNodeUid> pending)
    {
        public Queue<ProtonDriveNodeUid> Pending { get; } = pending;
    }
}
