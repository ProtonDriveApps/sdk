using System.Data;
using Microsoft.Data.Sqlite;

namespace Proton.Sdk.Caching;

public sealed class SqliteCacheRepository : ICacheRepository, IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly int? _maxCacheSize;

    private SqliteCacheRepository(SqliteConnection connection, int? maxCacheSize)
    {
        _connection = connection;
        _maxCacheSize = maxCacheSize;
    }

    public static SqliteCacheRepository OpenInMemory(int? maxCacheSize = 1024)
    {
        // Avoiding SqliteConnectionStringBuilder due to IL2113 warning in AOT scenarios
        var connectionString = $"Data Source={Guid.NewGuid().ToString()};Mode=Memory;Cache=Shared";

        return Open(connectionString, maxCacheSize);
    }

    public static SqliteCacheRepository OpenFile(string path, int? maxCacheSize = 1024)
    {
        // Avoiding SqliteConnectionStringBuilder due to IL2113 warning in AOT scenarios
        var connectionString = $"Data Source=\"{path}\"";

        return Open(connectionString, maxCacheSize);
    }

    ValueTask ICacheRepository.SetAsync(string key, string value, IEnumerable<string> tags, CancellationToken cancellationToken)
    {
        try
        {
            Set(key, value, tags);

            return ValueTask.CompletedTask;
        }
        catch (Exception e)
        {
            return ValueTask.FromException(e);
        }
    }

    ValueTask ICacheRepository.RemoveAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            Remove(key);

            return ValueTask.CompletedTask;
        }
        catch (Exception e)
        {
            return ValueTask.FromException(e);
        }
    }

    ValueTask ICacheRepository.RemoveByTagAsync(string tag, CancellationToken cancellationToken)
    {
        try
        {
            RemoveByTag(tag);

            return ValueTask.CompletedTask;
        }
        catch (Exception e)
        {
            return ValueTask.FromException(e);
        }
    }

    public ValueTask ClearAsync()
    {
        try
        {
            Clear();

            return ValueTask.CompletedTask;
        }
        catch (Exception e)
        {
            return ValueTask.FromException(e);
        }
    }

    ValueTask<string?> ICacheRepository.TryGetAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            return ValueTask.FromResult(TryGet(key));
        }
        catch (Exception e)
        {
            return ValueTask.FromException<string?>(e);
        }
    }

    IAsyncEnumerable<(string Key, string Value)> ICacheRepository.GetByTagsAsync(IEnumerable<string> tags, CancellationToken cancellationToken)
    {
        return GetByTags(tags).ToAsyncEnumerable();
    }

    ValueTask IAsyncDisposable.DisposeAsync()
    {
        Dispose();

        return ValueTask.CompletedTask;
    }

    public void Set(string key, string value, IEnumerable<string> tags)
    {
        using var connection = new SqliteConnection(_connection.ConnectionString);
        connection.Open();

        using var transaction = connection.BeginTransaction();

        // Check if eviction is needed (if LRU is enabled)
        if (_maxCacheSize.HasValue)
        {
            var currentSize = GetCacheSize(connection, transaction);

            if (currentSize >= _maxCacheSize.Value)
            {
                // Check if key already exists (updates don't need eviction)
                using var checkCommand = connection.CreateCommand();
                checkCommand.Transaction = transaction;
                checkCommand.CommandText = "SELECT 1 FROM Entries WHERE Key = @key";
                checkCommand.Parameters.AddWithValue("@key", key);
                var exists = checkCommand.ExecuteScalar() != null;

                if (!exists)
                {
                    // Evict 25% of cache or at least 1 item
                    var evictionCount = Math.Max(1, _maxCacheSize.Value / 4);
                    EvictLeastRecentlyUsed(connection, transaction, evictionCount);
                }
            }
        }

        using var command = connection.CreateCommand();

        command.Transaction = transaction;
        command.CommandText =
            """
            INSERT INTO Entries (Key, Value, LastAccessedUtc)
            VALUES (@key, @value, @timestamp)
            ON CONFLICT (Key) DO UPDATE SET
                Value = @value,
                LastAccessedUtc = @timestamp
            """;

        command.Parameters.AddWithValue("@key", key);
        command.Parameters.AddWithValue("@value", value);
        command.Parameters.AddWithValue("@timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

        command.ExecuteNonQuery();

        command.CommandText = "DELETE FROM Tags WHERE Key = @key";

        command.ExecuteNonQuery();

        command.CommandText = "INSERT INTO Tags (Tag, Key) VALUES (@tag, @key)";

        var tagParameter = command.CreateParameter();
        tagParameter.ParameterName = "@tag";
        command.Parameters.Add(tagParameter);

        foreach (var tag in tags)
        {
            tagParameter.Value = tag;

            command.ExecuteNonQuery();
        }

        transaction.Commit();
    }

    public void Remove(string key)
    {
        using var connection = new SqliteConnection(_connection.ConnectionString);
        connection.Open();

        using var command = connection.CreateCommand();

        command.CommandText = "DELETE FROM Entries WHERE Key = @key";
        command.Parameters.AddWithValue("@key", key);

        command.ExecuteNonQuery();
    }

    public void RemoveByTag(string tag)
    {
        using var connection = new SqliteConnection(_connection.ConnectionString);
        connection.Open();

        using var command = connection.CreateCommand();

        command.CommandText = "DELETE FROM Entries AS e WHERE EXISTS (SELECT 1 FROM Tags WHERE Tag = @tag AND Key = e.Key)";
        command.Parameters.AddWithValue("@tag", tag);

        command.ExecuteNonQuery();
    }

    public void Clear()
    {
        using var connection = new SqliteConnection(_connection.ConnectionString);
        connection.Open();

        using var command = connection.CreateCommand();

        command.CommandText = "DELETE FROM Entries";

        command.ExecuteNonQuery();
    }

    public string? TryGet(string key)
    {
        using var connection = new SqliteConnection(_connection.ConnectionString);
        connection.Open();

        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;

        // Read value
        command.CommandText = "SELECT Value FROM Entries WHERE Key = @key";
        command.Parameters.AddWithValue("@key", key);
        var reader = command.ExecuteReader();

        if (!reader.Read())
        {
            return null;
        }

        var value = reader.GetFieldValue<string>("Value");
        reader.Close();

        // Update timestamp
        command.CommandText = "UPDATE Entries SET LastAccessedUtc = @timestamp WHERE Key = @key";
        command.Parameters.Clear();
        command.Parameters.AddWithValue("@timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        command.Parameters.AddWithValue("@key", key);
        command.ExecuteNonQuery();

        transaction.Commit();
        return value;
    }

    public IEnumerable<(string Key, string Value)> GetByTags(IEnumerable<string> tags)
    {
        using var connection = new SqliteConnection(_connection.ConnectionString);
        connection.Open();

        // Collect all matching entries first (existing query logic)
        var results = new List<(string Key, string Value)>();

        using (var command = connection.CreateCommand())
        {
            command.Connection = connection;

            var i = 0;
            foreach (var tag in tags)
            {
                command.Parameters.AddWithValue($"@tag{i++}", tag);
            }

            var inClause = string.Join(", ", command.Parameters.Cast<SqliteParameter>().Select(x => x.ParameterName));

            command.CommandText =
                $"""
                 SELECT Key, Value
                 FROM Entries
                 WHERE Key IN (
                   SELECT t.Key
                   FROM Tags t
                   WHERE t.Tag IN ({inClause})
                   GROUP BY t.Key
                   HAVING COUNT(DISTINCT t.Tag) = @tagCount
                 );
                 """;

            command.Parameters.AddWithValue("@tagCount", command.Parameters.Count);

            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                results.Add((reader.GetString(0), reader.GetString(1)));
            }
        }

        // Batch update timestamps for all returned keys
        if (results.Count > 0)
        {
            using var updateCommand = connection.CreateCommand();
            var keyParams = string.Join(",", Enumerable.Range(0, results.Count).Select(i => $"@key{i}"));
            updateCommand.CommandText =
                $"UPDATE Entries SET LastAccessedUtc = @timestamp WHERE Key IN ({keyParams})";

            updateCommand.Parameters.AddWithValue("@timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            for (var i = 0; i < results.Count; i++)
            {
                updateCommand.Parameters.AddWithValue($"@key{i}", results[i].Key);
            }

            updateCommand.ExecuteNonQuery();
        }

        // Return via yield
        foreach (var result in results)
        {
            yield return result;
        }
    }

    public void Dispose()
    {
        SqliteConnection.ClearPool(_connection);
        _connection.Close();
        _connection.Dispose();
    }

    private static int GetCacheSize(SqliteConnection connection, SqliteTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT COUNT(*) FROM Entries";
        return Convert.ToInt32(command.ExecuteScalar());
    }

    private static void EvictLeastRecentlyUsed(SqliteConnection connection, SqliteTransaction transaction, int count)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            DELETE FROM Entries
            WHERE Key IN (
                SELECT Key
                FROM Entries
                ORDER BY LastAccessedUtc ASC
                LIMIT @count
            )
            """;
        command.Parameters.AddWithValue("@count", count);
        command.ExecuteNonQuery();
    }

    private static SqliteCacheRepository Open(string connectionString, int? maxCacheSize)
    {
        if (maxCacheSize <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxCacheSize), "Max cache size must be greater than 0 or null to disable LRU.");
        }

        var connection = new SqliteConnection(connectionString);

        try
        {
            connection.Open();

            InitializeDatabase(connection);

            return new SqliteCacheRepository(connection, maxCacheSize);
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    private static void InitializeDatabase(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();

        command.CommandText = "PRAGMA journal_mode = 'wal'";

        command.ExecuteNonQuery();

        command.CommandText =
            """
            CREATE TABLE IF NOT EXISTS Entries (
                Key TEXT NOT NULL,
                Value TEXT NOT NULL,
                LastAccessedUtc INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (Key)
            )
            """;

        command.ExecuteNonQuery();

        command.CommandText = "CREATE INDEX IF NOT EXISTS idx_entries_last_accessed ON Entries(LastAccessedUtc)";
        command.ExecuteNonQuery();

        command.CommandText =
            """
            CREATE TABLE IF NOT EXISTS Tags (
                Tag TEXT NOT NULL,
                Key TEXT NOT NULL,
                PRIMARY KEY (Tag, Key),
                FOREIGN KEY (Key) REFERENCES Entries(Key) ON DELETE CASCADE
            )
            """;

        command.ExecuteNonQuery();

        command.CommandText =
            """
            CREATE TABLE IF NOT EXISTS QueryableTags (
                Tag TEXT NOT NULL,
                PRIMARY KEY (Tag)
            )
            """;

        command.ExecuteNonQuery();
    }
}
