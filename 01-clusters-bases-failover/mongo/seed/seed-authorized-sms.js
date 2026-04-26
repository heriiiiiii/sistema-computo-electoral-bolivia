// =============================================================================
//  seed-authorized-sms.js
//  Authorized SMS Phone Numbers — Sistema Nacional de Cómputo Electoral Bolivia
//
//  Run via:
//    mongosh "mongodb://localhost:27017/oep_rrv?replicaSet=rs0" /scripts/seed/seed-authorized-sms.js
//
//  IDEMPOTENT: uses upsert on numeroOrigen (unique key).
// =============================================================================

print("=================================================");
print(" OEP — Seeding sms_numeros_autorizados");
print("=================================================");

use("oep_rrv");

const now = new Date();

// Authorized phone numbers tied to specific mesas in Recinto 10101001
// codigoRecinto 10101001 = Instituto Particular Quillacollo, Sucre, Chuquisaca
const authorizedNumbers = [
  {
    numeroOrigen: "+59172100001",
    codigoRecinto: "10101001",
    codigoMesa: "10101001001",
    nombreResponsable: "Juan Carlos Mamani Flores",
    cargoResponsable: "Jurado Electoral Mesa 1",
    activo: true,
    fechaAutorizacion: new Date("2024-10-15T08:00:00Z"),
    autorizadoPor: "OEP_ADMIN",
  },
  {
    numeroOrigen: "+59172100002",
    codigoRecinto: "10101001",
    codigoMesa: "10101001002",
    nombreResponsable: "María Elena Quispe Condori",
    cargoResponsable: "Jurado Electoral Mesa 2",
    activo: true,
    fechaAutorizacion: new Date("2024-10-15T08:00:00Z"),
    autorizadoPor: "OEP_ADMIN",
  },
  {
    numeroOrigen: "+59172100003",
    codigoRecinto: "10101001",
    codigoMesa: "10101001003",
    nombreResponsable: "Pedro Alvarado Tarqui",
    cargoResponsable: "Jurado Electoral Mesa 3",
    activo: true,
    fechaAutorizacion: new Date("2024-10-15T08:00:00Z"),
    autorizadoPor: "OEP_ADMIN",
  },
  {
    numeroOrigen: "+59172100004",
    codigoRecinto: "10101002",
    codigoMesa: "10101002001",
    nombreResponsable: "Rosa Chávez Limachi",
    cargoResponsable: "Jurado Electoral Mesa 1",
    activo: true,
    fechaAutorizacion: new Date("2024-10-15T08:00:00Z"),
    autorizadoPor: "OEP_ADMIN",
  },
  {
    numeroOrigen: "+59172100005",
    codigoRecinto: "10101002",
    codigoMesa: "10101002002",
    nombreResponsable: "Carlos Zenteno Huanca",
    cargoResponsable: "Jurado Electoral Mesa 2",
    activo: true,
    fechaAutorizacion: new Date("2024-10-15T08:00:00Z"),
    autorizadoPor: "OEP_ADMIN",
  },
  {
    numeroOrigen: "+59172100006",
    codigoRecinto: "20201001",
    codigoMesa: "20201001001",
    nombreResponsable: "Ana Villanueva Poma",
    cargoResponsable: "Jurado Electoral Mesa 1",
    activo: true,
    fechaAutorizacion: new Date("2024-10-15T08:00:00Z"),
    autorizadoPor: "OEP_ADMIN",
  },
  {
    numeroOrigen: "+59172100007",
    codigoRecinto: "20201001",
    codigoMesa: "20201001002",
    nombreResponsable: "Luis Torrico Callisaya",
    cargoResponsable: "Jurado Electoral Mesa 2",
    activo: true,
    fechaAutorizacion: new Date("2024-10-15T08:00:00Z"),
    autorizadoPor: "OEP_ADMIN",
  },
  {
    // Inactive — was revoked before election day
    numeroOrigen: "+59172100008",
    codigoRecinto: "10101003",
    codigoMesa: "10101003001",
    nombreResponsable: "Fernando Aguilar Reyes",
    cargoResponsable: "Jurado Electoral Mesa 1",
    activo: false,
    fechaAutorizacion: new Date("2024-10-15T08:00:00Z"),
    autorizadoPor: "OEP_ADMIN",
  },
  {
    numeroOrigen: "+59172100009",
    codigoRecinto: "30301001",
    codigoMesa: "30301001001",
    nombreResponsable: "Silvia Roca Ibáñez",
    cargoResponsable: "Jurado Electoral Mesa 1",
    activo: true,
    fechaAutorizacion: new Date("2024-10-15T08:00:00Z"),
    autorizadoPor: "OEP_ADMIN",
  },
  {
    numeroOrigen: "+59172100010",
    codigoRecinto: "30301001",
    codigoMesa: "30301001002",
    nombreResponsable: "Gonzalo Rivero Mendoza",
    cargoResponsable: "Jurado Electoral Mesa 2",
    activo: true,
    fechaAutorizacion: new Date("2024-10-15T08:00:00Z"),
    autorizadoPor: "OEP_ADMIN",
  },
];

let inserted = 0;
let updated  = 0;

authorizedNumbers.forEach(function (num) {
  const result = db.sms_numeros_autorizados.updateOne(
    { numeroOrigen: num.numeroOrigen },
    {
      $set: { ...num, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  if (result.upsertedCount > 0) {
    inserted++;
    print("[INSERT] " + num.numeroOrigen + " → mesa " + num.codigoMesa);
  } else if (result.modifiedCount > 0) {
    updated++;
    print("[UPDATE] " + num.numeroOrigen + " (already existed, updated)");
  } else {
    print("[SKIP]   " + num.numeroOrigen + " (no change)");
  }
});

print("\n[DONE] Inserted: " + inserted + " | Updated: " + updated);
print("       Total active:   " + db.sms_numeros_autorizados.countDocuments({ activo: true }));
print("       Total inactive: " + db.sms_numeros_autorizados.countDocuments({ activo: false }));
print("=================================================");
