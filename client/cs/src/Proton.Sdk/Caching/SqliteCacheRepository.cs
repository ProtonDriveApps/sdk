using System.Data;
using Microsoft.Data.Sqlite;

namespace Proton.Sdk.Caching;

public sealed class SqliteCacheRepository : ICacheRepository, IDisposable
{
    private const int DatabaseSchemaVersion = 1;

    private readonly SqliteConnection _anchorConnection;
    private readonly int? _maxCacheSize;

    private SqliteCacheRepository(SqliteConnection anchorConnection, int? maxCacheSize)
    {
        _anchorConnection = anchorConnection;
        _maxCacheSize = maxCacheSize;
    }

    public static SqliteCacheRepository OpenInMemory(string? name = null, int? maxCacheSize = 1000)
    {
        if (name is { Length: 0 })
        {
            throw new ArgumentException("Value cannot be empty.", nameof(name));
        }

        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = name ?? Guid.NewGuid().ToString(),
            Mode = SqliteOpenMode.Memory,
            Cache = SqliteCacheMode.Shared,
        }.ToString();

        return Open(connectionString, maxCacheSize);
    }

    public static SqliteCacheRepository OpenFile(string path, int? maxCacheSize = 1000)
    {
        var connectionString = new SqliteConnectionStringBuilder { DataSource = path }.ToString();

        return Open(connectionString, maxCacheSize);
    }

    ValueTask ICacheRepository.EnsureValueFormatVersionAsync(string valueFormatVersion, CancellationToken cancellationToken)
    {
        try
        {
            EnsureValueFormatVersion(valueFormatVersion);

            return ValueTask.CompletedTask;
        }
        catch (Exception exception)
        {
            return ValueTask.FromException(exception);
        }
    }

    ValueTask ICacheRepository.SetAsync(string key, ReadOnlyMemory<byte> value, CancellationToken cancellationToken)
    {
        try
        {
            Set(key, value);

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

    ValueTask<byte[]?> ICacheRepository.TryGetAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            return ValueTask.FromResult(TryGet(key));
        }
        catch (Exception e)
        {
            return ValueTask.FromException<byte[]?>(e);
        }
    }

    ValueTask IAsyncDisposable.DisposeAsync()
    {
        Dispose();

        return ValueTask.CompletedTask;
    }

    /// <summary>
    /// Wipes all entries when <paramref name="valueFormatVersion"/> differs from the stored version, then writes the new version.
    /// </summary>
    /// <remarks>
    /// Uses its own connection and transaction, independent of concurrent Set/TryGet/Remove calls.
    /// Multiple callers may invoke this concurrently on first use of a shared repository (each with their own lazy initializer);
    /// that is safe only when every caller passes the same version string. A mismatch from any caller deletes all entries, including
    /// those written by another caller that uses a different version.
    /// </remarks>
    public void EnsureValueFormatVersion(string valueFormatVersion)
    {
        using var connection = new SqliteConnection(_anchorConnection.ConnectionString);
        connection.Open();

        var storedValueFormatVersion = TryGetStoredValueFormatVersion(connection);

        if (string.Equals(storedValueFormatVersion, valueFormatVersion, StringComparison.Ordinal))
        {
            return;
        }

        using var transaction = connection.BeginTransaction();

        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "DELETE FROM Entries";
        command.ExecuteNonQuery();

        WriteCacheVersion(connection, DatabaseSchemaVersion, valueFormatVersion, transaction);

        transaction.Commit();
    }

    public void Set(string key, ReadOnlyMemory<byte> value)
    {
        using var connection = new SqliteConnection(_anchorConnection.ConnectionString);
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
        command.Parameters.AddWithValue("@value", value.ToArray());
        command.Parameters.AddWithValue("@timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

        command.ExecuteNonQuery();

        transaction.Commit();
    }

    public void Remove(string key)
    {
        using var connection = new SqliteConnection(_anchorConnection.ConnectionString);
        connection.Open();

        using var command = connection.CreateCommand();

        command.CommandText = "DELETE FROM Entries WHERE Key = @key";
        command.Parameters.AddWithValue("@key", key);

        command.ExecuteNonQuery();
    }

    public void Clear()
    {
        using var connection = new SqliteConnection(_anchorConnection.ConnectionString);
        connection.Open();

        using var command = connection.CreateCommand();

        command.CommandText = "DELETE FROM Entries";

        command.ExecuteNonQuery();
    }

    public byte[]? TryGet(string key)
    {
        using var connection = new SqliteConnection(_anchorConnection.ConnectionString);
        connection.Open();

        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;

        // Read value
        command.CommandText = "SELECT Value FROM Entries WHERE Key = @key";
        command.Parameters.AddWithValue("@key", key);

        byte[] value;
        using (var reader = command.ExecuteReader())
        {
            if (!reader.Read())
            {
                return null;
            }

            value = reader.GetFieldValue<byte[]>("Value");
        }

        // Update timestamp
        command.CommandText = "UPDATE Entries SET LastAccessedUtc = @timestamp WHERE Key = @key";
        command.Parameters.Clear();
        command.Parameters.AddWithValue("@timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        command.Parameters.AddWithValue("@key", key);
        command.ExecuteNonQuery();

        transaction.Commit();
        return value;
    }

    public void Dispose()
    {
        SqliteConnection.ClearPool(_anchorConnection);
        _anchorConnection.Close();
        _anchorConnection.Dispose();
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

        command.CommandText = "PRAGMA journal_mode = WAL";

        command.ExecuteNonQuery();

        command.CommandText = "PRAGMA synchronous = NORMAL";

        command.ExecuteNonQuery();

        var storedDatabaseSchemaVersion = TryGetStoredDatabaseSchemaVersion(connection);

        if (storedDatabaseSchemaVersion != DatabaseSchemaVersion)
        {
            DropSchema(connection);
            EnsureSchema(connection);
            WriteCacheVersion(connection, DatabaseSchemaVersion, valueFormatVersion: null);
        }
        else
        {
            EnsureSchema(connection);
        }
    }

    private static int? TryGetStoredDatabaseSchemaVersion(SqliteConnection connection)
    {
        if (!CacheVersionTableExists(connection))
        {
            return null;
        }

        using var command = connection.CreateCommand();
        command.CommandText = "SELECT DatabaseSchemaVersion FROM CacheVersion LIMIT 1";

        var result = command.ExecuteScalar();

        return result is null or DBNull ? null : Convert.ToInt32(result);
    }

    private static string? TryGetStoredValueFormatVersion(SqliteConnection connection)
    {
        if (!CacheVersionTableExists(connection))
        {
            return null;
        }

        using var command = connection.CreateCommand();
        command.CommandText = "SELECT ValueFormatVersion FROM CacheVersion LIMIT 1";

        return command.ExecuteScalar() as string;
    }

    private static bool CacheVersionTableExists(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'CacheVersion' LIMIT 1";

        return command.ExecuteScalar() is not null;
    }

    private static void DropSchema(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            DROP TABLE IF EXISTS Entries;
            DROP INDEX IF EXISTS idx_entries_last_accessed;
            DROP INDEX IF EXISTS idx_cacheversion_database_schema_version;
            DROP TABLE IF EXISTS CacheVersion;
            """;

        command.ExecuteNonQuery();
    }

    private static void EnsureSchema(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            CREATE TABLE IF NOT EXISTS Entries (
                Key TEXT NOT NULL,
                Value BLOB NOT NULL,
                LastAccessedUtc INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (Key)
            );
            CREATE INDEX IF NOT EXISTS idx_entries_last_accessed ON Entries(LastAccessedUtc);
            CREATE TABLE IF NOT EXISTS CacheVersion (
                DatabaseSchemaVersion INTEGER NOT NULL,
                ValueFormatVersion TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cacheversion_database_schema_version
                ON CacheVersion(DatabaseSchemaVersion);
            """;

        command.ExecuteNonQuery();
    }

    private static void WriteCacheVersion(
        SqliteConnection connection,
        int databaseSchemaVersion,
        string? valueFormatVersion,
        SqliteTransaction? transaction = null)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            INSERT INTO CacheVersion (DatabaseSchemaVersion, ValueFormatVersion)
            VALUES (@databaseSchemaVersion, @valueFormatVersion)
            ON CONFLICT(DatabaseSchemaVersion) DO UPDATE SET
                ValueFormatVersion = excluded.ValueFormatVersion
            """;
        command.Parameters.AddWithValue("@databaseSchemaVersion", databaseSchemaVersion);
        command.Parameters.AddWithValue("@valueFormatVersion", valueFormatVersion ?? (object)DBNull.Value);

        command.ExecuteNonQuery();
    }
}
