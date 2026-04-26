// =============================================================================
//  test-mongo-connection.js
//  MongoDB Connection Test — Sistema Nacional de Cómputo Electoral Bolivia
//
//  Connects to the MongoDB Replica Set, pings, and shows:
//    - Replica set name and members
//    - Node states (PRIMARY / SECONDARY)
//    - Collection names in oep_rrv
//    - Document counts per collection
//
//  Usage:
//    cd scripts && npm install
//    node test-mongo-connection.js
// =============================================================================

const { MongoClient } = require("mongodb");

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://localhost:27017,localhost:27018,localhost:27019/oep_rrv?replicaSet=rs0";

async function main() {
  console.log("=================================================");
  console.log(" OEP — MongoDB Connection Test");
  console.log("=================================================");
  console.log("[INFO] URI:", MONGO_URI.replace(/\/\/(.*):(.*)@/, "//***:***@"));
  console.log("");

  const client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });

  try {
    await client.connect();
    console.log("[OK]  Connected to MongoDB.");

    // Ping
    const admin = client.db("admin");
    const ping = await admin.command({ ping: 1 });
    console.log("[OK]  Ping response:", JSON.stringify(ping));

    // Replica set status
    console.log("\n── Replica Set Status ───────────────────────────");
    const rsStatus = await admin.command({ replSetGetStatus: 1 });
    console.log("    Name: " + rsStatus.set);
    console.log("    Members:");
    rsStatus.members.forEach((m) => {
      const role  = m.stateStr === "PRIMARY" ? "▶ PRIMARY  " : "◉ SECONDARY";
      const health = m.health === 1 ? "✔ healthy" : "✘ unhealthy";
      console.log(`      ${role}  ${m.name}  [${health}]`);
    });

    // isMaster / hello
    const hello = await admin.command({ hello: 1 });
    console.log("\n── Connection Info ──────────────────────────────");
    console.log("    Connected to primary: " + hello.ismaster);
    console.log("    Primary:  " + hello.primary);
    console.log("    Hosts:    " + (hello.hosts || []).join(", "));

    // Collection counts
    const db = client.db("oep_rrv");
    const collections = [
      "rrv_actas",
      "rrv_sms",
      "sms_numeros_autorizados",
      "rrv_resultados_preliminares",
      "rrv_eventos",
      "rrv_logs",
      "rrv_cluster_status",
    ];

    console.log("\n── Collection Counts (oep_rrv) ──────────────────");
    for (const name of collections) {
      const count = await db.collection(name).countDocuments();
      const padded = name.padEnd(30);
      console.log(`    ${padded}: ${count} document(s)`);
    }

    // Sample query — latest acta
    const latestActa = await db
      .collection("rrv_actas")
      .findOne({}, { sort: { createdAt: -1 }, projection: { actaId: 1, estado: 1, codigoMesa: 1 } });
    if (latestActa) {
      console.log("\n── Latest Acta ──────────────────────────────────");
      console.log("    actaId    : " + latestActa.actaId);
      console.log("    codigoMesa: " + latestActa.codigoMesa);
      console.log("    estado    : " + latestActa.estado);
    }

    console.log("\n=================================================");
    console.log(" Connection test PASSED.");
    console.log("=================================================");
  } catch (err) {
    console.error("\n[ERROR] Connection failed: " + err.message);
    console.error("\nTroubleshooting:");
    console.error("  1. Make sure all 3 mongo containers are running:");
    console.error("       docker compose ps");
    console.error("  2. Make sure the replica set was initialized:");
    console.error("       docker compose run --rm mongo-init");
    console.error("  3. Wait ~30s after first start for election to complete.");
    process.exit(1);
  } finally {
    await client.close().catch(() => {});
  }
}

main();
