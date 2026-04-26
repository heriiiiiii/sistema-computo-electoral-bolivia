// =============================================================================
//  init-replica.js
//  MongoDB Replica Set Initialization — Sistema Nacional de Cómputo Electoral
//
//  Run via:
//    docker compose run --rm mongo-init
//  Or directly:
//    mongosh --host mongo1 --port 27017 /scripts/init-replica.js
//
//  This script is IDEMPOTENT: safe to run multiple times.
//  If the replica set is already initialized it prints the current status.
// =============================================================================

print("=================================================");
print(" OEP — MongoDB Replica Set Initialization");
print(" Target: rs0 (mongo1, mongo2, mongo3)");
print("=================================================");

// ── Check if the replica set is already initialized ──────────────────────────
let alreadyInitialized = false;

try {
  const status = rs.status();
  print("\n[INFO] Replica set is ALREADY initialized.");
  print("[INFO] Name    : " + status.set);
  print("[INFO] Members : " + status.members.length);
  status.members.forEach(function (m) {
    print("         " + m.name + " → " + m.stateStr);
  });
  alreadyInitialized = true;
} catch (e) {
  if (e.codeName === "NotYetInitialized" || e.code === 94) {
    print("\n[INFO] Replica set not yet initialized. Proceeding...");
  } else {
    print("\n[ERROR] Unexpected error checking replica set status:");
    print("        " + e.message);
    quit(1);
  }
}

if (alreadyInitialized) {
  print("\n[OK] Nothing to do. Exiting.");
  quit(0);
}

// ── Initialize the replica set ────────────────────────────────────────────────
print("\n[INFO] Calling rs.initiate()...");

const config = {
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo1:27017", priority: 2 },
    { _id: 1, host: "mongo2:27017", priority: 1 },
    { _id: 2, host: "mongo3:27017", priority: 1 },
  ],
};

let result;
try {
  result = rs.initiate(config);
} catch (e) {
  print("[ERROR] rs.initiate() failed: " + e.message);
  quit(1);
}

if (result.ok !== 1) {
  print("[ERROR] rs.initiate() returned ok=0");
  printjson(result);
  quit(1);
}

print("[INFO] rs.initiate() OK. Waiting for PRIMARY election...");

// ── Wait for the PRIMARY to be elected (up to 60 seconds) ────────────────────
let electionTimeout = 60;
let elapsed = 0;
let primaryElected = false;

while (elapsed < electionTimeout) {
  sleep(2000);
  elapsed += 2;

  try {
    const isMaster = db.adminCommand({ isMaster: 1 });
    if (isMaster.ismaster === true) {
      primaryElected = true;
      break;
    }
    process.stdout.write(".");
  } catch (e) {
    process.stdout.write("?");
  }
}

print("");

if (!primaryElected) {
  print("[WARNING] Primary was not elected within " + electionTimeout + "s.");
  print("[WARNING] The cluster may still be converging. Check rs.status().");
} else {
  print("[OK] PRIMARY elected after " + elapsed + "s.");
}

// ── Print final status ────────────────────────────────────────────────────────
print("\n[INFO] Final replica set status:");
try {
  const finalStatus = rs.status();
  finalStatus.members.forEach(function (m) {
    print("  " + m.name + " → " + m.stateStr);
  });
} catch (e) {
  print("[WARNING] Could not retrieve final status: " + e.message);
}

print("\n=================================================");
print(" Initialization complete.");
print(" Next steps:");
print("   1. docker compose up -d   (starts all services)");
print("   2. mongosh --host localhost:27017 --eval \"rs.status()\"");
print("   3. cd scripts && npm install && node test-mongo-connection.js");
print("=================================================");
