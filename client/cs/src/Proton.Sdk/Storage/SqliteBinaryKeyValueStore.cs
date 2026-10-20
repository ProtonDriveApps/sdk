using System.Data;
using Microsoft.Data.Sqlite;

namespace Proton.Sdk.Storage;

/// <summary>
/// File- or memory-backed key-value store without eviction or cache format versioning.
/// </summary>
public sealed class SqliteBinaryKeyValueStore : IBinaryKeyValueStore, IDisposable
{
    private const int DatabaseSchemaVersion = 1;

    private readonly SqliteConnection _anchorConnection;

    private SqliteBinaryKeyValueStore(SqliteConnection anchorConnection)
    {
        _anchorConnection = anchorConnection;
    }

    public static SqliteBinaryKeyValueStore OpenInMemory(string? name = null)
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

        return Open(connectionString);
    }

    public static SqliteBinaryKeyValueStore OpenFile(string path)
    {
        var connectionString = new SqliteConnectionStringBuilder { DataSource = path }.ToString();
        return Open(connectionString);
    }

    public ValueTask SetAsync(string key, ReadOnlyMemory<byte> value, CancellationToken cancellationToken = default)
    {
        try
        {
            Set(key, value);
            return ValueTask.CompletedTask;
        }
        catch (Exception exception)
        {
            return ValueTask.FromException(exception);
        }
    }

    public ValueTask<byte[]?> TryGetAsync(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            return ValueTask.FromResult(TryGet(key));
        }
        catch (Exception exception)
        {
            return ValueTask.FromException<byte[]?>(exception);
        }
    }

    public ValueTask RemoveAsync(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            Remove(key);
            return ValueTask.CompletedTask;
        }
        catch (Exception exception)
        {
            return ValueTask.FromException(exception);
        }
    }

    public ValueTask RemoveByPrefixAsync(string prefix, CancellationToken cancellationToken = default)
    {
        try
        {
            RemoveByPrefix(prefix);
            return ValueTask.CompletedTask;
        }
        catch (Exception exception)
        {
            return ValueTask.FromException(exception);
        }
    }

    public ValueTask ClearAsync()
    {
        try
        {
            Clear();
            return ValueTask.CompletedTask;
        }
        catch (Exception exception)
        {
            return ValueTask.FromException(exception);
        }
    }

    public ValueTask DisposeAsync()
    {
        Dispose();
        return ValueTask.CompletedTask;
    }

    public void Set(string key, ReadOnlyMemory<byte> value)
    {
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            """
            INSERT INTO Entries (Key, Value)
            VALUES (@key, @value)
            ON CONFLICT (Key) DO UPDATE SET Value = @value
            """;
        command.Parameters.AddWithValue("@key", key);
        command.Parameters.AddWithValue("@value", value.ToArray());
        command.ExecuteNonQuery();
        transaction.Commit();
    }

    public byte[]? TryGet(string key)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT Value FROM Entries WHERE Key = @key";
        command.Parameters.AddWithValue("@key", key);

        using var reader = command.ExecuteReader();
        return reader.Read() ? reader.GetFieldValue<byte[]>("Value") : null;
    }

    public void Remove(string key)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM Entries WHERE Key = @key";
        command.Parameters.AddWithValue("@key", key);
        command.ExecuteNonQuery();
    }

    public void RemoveByPrefix(string prefix)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();

        // Compared with substr rather than LIKE, so that '%' and '_' in the prefix are not wildcards.
        // This scans the whole table, which is acceptable for a store dedicated to one consumer.
        command.CommandText = "DELETE FROM Entries WHERE substr(Key, 1, length(@prefix)) = @prefix";
        command.Parameters.AddWithValue("@prefix", prefix);
        command.ExecuteNonQuery();
    }

    public void Clear()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM Entries";
        command.ExecuteNonQuery();
    }

    public void Dispose()
    {
        SqliteConnection.ClearPool(_anchorConnection);
        _anchorConnection.Close();
        _anchorConnection.Dispose();
    }

    private static SqliteBinaryKeyValueStore Open(string connectionString)
    {
        var connection = new SqliteConnection(connectionString);
        try
        {
            connection.Open();
            InitializeDatabase(connection);
            return new SqliteBinaryKeyValueStore(connection);
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

        var storedSchemaVersion = TryGetStoredSchemaVersion(connection);
        if (storedSchemaVersion != DatabaseSchemaVersion)
        {
            DropSchema(connection);
            EnsureSchema(connection);
            WriteSchemaVersion(connection, DatabaseSchemaVersion);
        }
        else
        {
            EnsureSchema(connection);
        }
    }

    private static int? TryGetStoredSchemaVersion(SqliteConnection connection)
    {
        if (!MetadataTableExists(connection))
        {
            return null;
        }

        using var command = connection.CreateCommand();
        command.CommandText = "SELECT SchemaVersion FROM StoreMetadata LIMIT 1";
        var result = command.ExecuteScalar();
        return result is null or DBNull ? null : Convert.ToInt32(result);
    }

    private static bool MetadataTableExists(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'StoreMetadata' LIMIT 1";
        return command.ExecuteScalar() is not null;
    }

    private static void DropSchema(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            DROP TABLE IF EXISTS Entries;
            DROP TABLE IF EXISTS StoreMetadata;
            """;
        command.ExecuteNonQuery();
    }

    private static void EnsureSchema(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            CREATE TABLE IF NOT EXISTS Entries (
                Key TEXT NOT NULL PRIMARY KEY,
                Value BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS StoreMetadata (
                SchemaVersion INTEGER NOT NULL
            );
            """;
        command.ExecuteNonQuery();
    }

    private static void WriteSchemaVersion(SqliteConnection connection, int schemaVersion)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM StoreMetadata";
        command.ExecuteNonQuery();
        command.CommandText = "INSERT INTO StoreMetadata (SchemaVersion) VALUES (@schemaVersion)";
        command.Parameters.AddWithValue("@schemaVersion", schemaVersion);
        command.ExecuteNonQuery();
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection(_anchorConnection.ConnectionString);
        connection.Open();
        return connection;
    }
}
