using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;

namespace Proton.Sdk.Caching;

public sealed class InMemoryCacheRepository : ICacheRepository, IDisposable
{
    private readonly ConcurrentDictionary<string, string> _entries = new();
    private readonly ConcurrentDictionary<string, HashSet<string>> _keyToTags = new();
    private readonly ConcurrentDictionary<string, HashSet<string>> _tagToKeys = new();
    private readonly ReaderWriterLockSlim _lock = new();

    IAsyncEnumerable<(string Key, string Value)> ICacheRepository.GetByTagsAsync(IEnumerable<string> tags, CancellationToken cancellationToken)
    {
        return GetByTags(tags).ToAsyncEnumerable();
    }

    ValueTask ICacheRepository.SetAsync(string key, string value, IEnumerable<string> tags, CancellationToken cancellationToken)
    {
        Set(key, value, tags, cancellationToken);

        return ValueTask.CompletedTask;
    }

    ValueTask<string?> ICacheRepository.TryGetAsync(string key, CancellationToken cancellationToken)
    {
        return ValueTask.FromResult(TryGet(key, out var value) ? value : null);
    }

    ValueTask ICacheRepository.RemoveAsync(string key, CancellationToken cancellationToken)
    {
        Remove(key);

        return ValueTask.CompletedTask;
    }

    ValueTask ICacheRepository.RemoveByTagAsync(string tag, CancellationToken cancellationToken)
    {
        RemoveByTag(tag);

        return ValueTask.CompletedTask;
    }

    ValueTask ICacheRepository.ClearAsync()
    {
        Clear();

        return ValueTask.CompletedTask;
    }

    ValueTask IAsyncDisposable.DisposeAsync()
    {
        Dispose();
        return ValueTask.CompletedTask;
    }

    public void Set(string key, string value, IEnumerable<string> tags, CancellationToken cancellationToken)
    {
        _lock.EnterWriteLock();
        try
        {
            ClearTagsForKey(key);

            _entries[key] = value;

            var newTags = new HashSet<string>(tags);
            _keyToTags[key] = newTags;

            foreach (var tag in newTags)
            {
                _tagToKeys.GetOrAdd(tag, _ => []).Add(key);
            }
        }
        finally
        {
            _lock.ExitWriteLock();
        }
    }

    public bool TryGet(string key, [MaybeNullWhen(false)] out string value)
    {
        return _entries.TryGetValue(key, out value);
    }

    public void Remove(string key)
    {
        _lock.EnterWriteLock();
        try
        {
            _entries.TryRemove(key, out _);

            ClearTagsForKey(key);
        }
        finally
        {
            _lock.ExitWriteLock();
        }
    }

    public void RemoveByTag(string tag)
    {
        _lock.EnterWriteLock();
        try
        {
            if (!_tagToKeys.TryGetValue(tag, out var keys))
            {
                return;
            }

            foreach (var key in keys.Where(key => _entries.TryRemove(key, out _)))
            {
                ClearTagsForKey(key);
            }
        }
        finally
        {
            _lock.ExitWriteLock();
        }
    }

    public void Clear()
    {
        _lock.EnterWriteLock();
        try
        {
            _entries.Clear();
            _keyToTags.Clear();
            _tagToKeys.Clear();
        }
        finally
        {
            _lock.ExitWriteLock();
        }
    }

    public IEnumerable<(string Key, string Value)> GetByTags(IEnumerable<string> tags)
    {
        var tagsList = tags.ToList();
        if (tagsList.Count == 0)
        {
            yield break;
        }

        List<(string Key, string Value)> results;

        _lock.EnterReadLock();
        try
        {
            HashSet<string>? candidateKeys = null;

            foreach (var tag in tagsList)
            {
                if (_tagToKeys.TryGetValue(tag, out var keysWithTag))
                {
                    if (candidateKeys is not null)
                    {
                        candidateKeys.IntersectWith(keysWithTag);
                    }
                    else
                    {
                        candidateKeys = [.. keysWithTag];
                    }

                    if (candidateKeys.Count == 0)
                    {
                        yield break;
                    }
                }
                else
                {
                    yield break;
                }
            }

            if (candidateKeys is null)
            {
                yield break;
            }

            results = [];
            foreach (var key in candidateKeys)
            {
                if (_entries.TryGetValue(key, out var value))
                {
                    results.Add((key, value));
                }
            }
        }
        finally
        {
            _lock.ExitReadLock();
        }

        foreach (var result in results)
        {
            yield return result;
        }
    }

    public void Dispose()
    {
        _lock.Dispose();
    }

    private void ClearTagsForKey(string key)
    {
        if (!_keyToTags.TryRemove(key, out var tags))
        {
            return;
        }

        foreach (var tag in tags)
        {
            if (_tagToKeys.TryGetValue(tag, out var keys)
                && keys.Remove(key)
                && keys.Count == 0)
            {
                _tagToKeys.TryRemove(tag, out _);
            }
        }
    }
}
