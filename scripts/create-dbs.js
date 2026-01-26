// scripts/create-dbs.js
print("Starting database creation on public container...");

// --- Database 1: testDB ---
db = db.getSiblingDB('testDB');
// Create a collection to ensure DB exists
db.createCollection('setup_complete');
db.setup_complete.insertOne({ created_at: new Date(), description: 'Database initialized' });

// Create User for testDB
db.createUser({
    user: "testUser",
    pwd: "testPassword123!",
    roles: [{ role: "readWrite", db: "testDB" }]
});
print("Created testDB and user 'testUser'.");


// --- Database 2: fetcherDB ---
db = db.getSiblingDB('fetcherDB');
db.createCollection('config');
db.config.insertOne({ created_at: new Date(), description: 'Web fetcher index database initialized' });

// Create User for fetcherDB
db.createUser({
    user: "fetcherUser",
    pwd: "fetcherPassword123!",
    roles: [{ role: "readWrite", db: "fetcherDB" }]
});
print("Created fetcherDB and user 'fetcherUser'.");

print("Public database creation and user setup completed successfully.");
