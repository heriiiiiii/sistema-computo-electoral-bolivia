"""Reparacion segura del territorio oficial de actas RRV existentes.

Recorre rrv_actas y, sin alterar estados ni resultados, persiste el campo
`territorioOficial` para que el dashboard geografico pueda agrupar por
departamento/provincia/municipio/recinto. Si la acta carece de codigoMesa, se
intenta recuperar desde el filename. Si el codigoRecinto o la ubicacion estan
vacios y el territorio fue resuelto, se completan a partir de la base
territorial. Las actas con ubicacion ya extraida se conservan tal cual; solo
se anota el territorioOficial al lado para el agrupamiento.

NO cambia:
  - estado
  - validacion.esValida
  - incluidoEnDashboard (la regla del backend la sigue calculando ActaService)
  - votos / resultados

Uso:
  python scripts/repair_rrv_territory.py --dry-run
  python scripts/repair_rrv_territory.py
  python scripts/repair_rrv_territory.py --limit 100
"""

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from app.config.database import get_collection  # noqa: E402
from app.constants.rrv_constants import COLECCIONES_RRV  # noqa: E402
from app.services.actas_impresas_service import (  # noqa: E402
    resolve_official_territory_for_acta,
)


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Repara el campo territorioOficial de actas RRV sin tocar estado, "
            "validacion ni votos."
        )
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Reporta cambios pero no escribe en MongoDB.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Procesar como maximo N actas.",
    )
    return parser.parse_args()


def _ubicacion_vacia(ubicacion):
    ubicacion = ubicacion or {}
    recinto = ubicacion.get("recinto") or {}
    return not any(
        (
            ubicacion.get("departamento"),
            ubicacion.get("provincia"),
            ubicacion.get("municipio"),
            recinto.get("nombre"),
            recinto.get("direccion"),
        )
    )


def _build_territorio_field(resolution):
    if not resolution.get("resuelto"):
        return {
            "resuelto": False,
            "fuente": resolution.get("fuente") or "none",
            "motivoNoResuelto": resolution.get("motivoNoResuelto"),
        }

    return {
        "resuelto": True,
        "fuente": resolution.get("fuente"),
        "codigoMesa": resolution.get("codigoMesaOficial"),
        "codigoRecinto": resolution.get("codigoRecintoOficial"),
        "codigoTerritorial": resolution.get("codigoTerritorial"),
        "departamento": resolution.get("departamento"),
        "provincia": resolution.get("provincia"),
        "municipio": resolution.get("municipio"),
        "recinto": {
            "nombre": (resolution.get("recinto") or {}).get("nombre"),
            "direccion": (resolution.get("recinto") or {}).get("direccion"),
        },
    }


def _ubicacion_from_territorio(territorio):
    return {
        "departamento": territorio.get("departamento"),
        "provincia": territorio.get("provincia"),
        "municipio": territorio.get("municipio"),
        "recinto": {
            "nombre": (territorio.get("recinto") or {}).get("nombre"),
            "direccion": (territorio.get("recinto") or {}).get("direccion"),
        },
    }


def main():
    args = parse_args()

    actas_col = get_collection(COLECCIONES_RRV["actas"])
    resultados_col = get_collection(COLECCIONES_RRV["resultados"])

    cursor = actas_col.find(
        {},
        {
            "actaId": 1,
            "codigoMesa": 1,
            "codigoRecinto": 1,
            "ubicacion": 1,
            "archivo": 1,
            "territorioOficial": 1,
            "estado": 1,
        },
    )

    if args.limit:
        cursor = cursor.limit(int(args.limit))

    summary = {
        "totalScanned": 0,
        "resolved": 0,
        "unresolved": 0,
        "recoveredCodigoMesaFromFilename": 0,
        "actasUpdated": 0,
        "resultadosUpdated": 0,
        "noChange": 0,
    }
    unresolved_reasons = {}
    now = datetime.now(timezone.utc)

    for acta in cursor:
        summary["totalScanned"] += 1

        try:
            resolution = resolve_official_territory_for_acta(acta)
        except Exception as error:
            unresolved_reasons.setdefault("EXCEPTION", 0)
            unresolved_reasons["EXCEPTION"] += 1
            summary["unresolved"] += 1
            print(
                f"  [warn] acta {acta.get('actaId')}: error resolviendo territorio "
                f"-> {error}"
            )
            continue

        territorio = _build_territorio_field(resolution)

        update_set = {"territorioOficial": territorio, "updatedAt": now}

        codigo_mesa_actual = acta.get("codigoMesa")
        codigo_recinto_actual = acta.get("codigoRecinto")
        ubicacion_actual = acta.get("ubicacion")

        if resolution.get("resuelto"):
            summary["resolved"] += 1

            if (
                not codigo_mesa_actual
                and resolution.get("codigoMesaOficial")
                and resolution.get("fuente") == "filename"
            ):
                update_set["codigoMesa"] = resolution.get("codigoMesaOficial")
                summary["recoveredCodigoMesaFromFilename"] += 1

            if not codigo_recinto_actual and resolution.get("codigoRecintoOficial"):
                update_set["codigoRecinto"] = resolution.get("codigoRecintoOficial")

            if _ubicacion_vacia(ubicacion_actual):
                update_set["ubicacion"] = _ubicacion_from_territorio(territorio)
        else:
            summary["unresolved"] += 1
            motivo = resolution.get("motivoNoResuelto") or "DESCONOCIDO"
            unresolved_reasons[motivo] = unresolved_reasons.get(motivo, 0) + 1

        # Si el unico cambio seria el campo territorioOficial igual al previo,
        # no contar como modificado.
        territorio_previo = acta.get("territorioOficial")
        only_territory_change = (
            set(update_set.keys()) == {"territorioOficial", "updatedAt"}
            and territorio_previo == territorio
        )
        if only_territory_change:
            summary["noChange"] += 1
            continue

        if args.dry_run:
            summary["actasUpdated"] += 1
            if acta.get("actaId"):
                # Estimacion: si rrv_resultados existe, contar como actualizable.
                if resultados_col.count_documents(
                    {"actaId": acta.get("actaId")}, limit=1
                ):
                    summary["resultadosUpdated"] += 1
            continue

        actas_col.update_one({"_id": acta["_id"]}, {"$set": update_set})
        summary["actasUpdated"] += 1

        if acta.get("actaId"):
            resultado_set = {
                "territorioOficial": territorio if territorio else None,
                "updatedAt": now,
            }
            if "codigoMesa" in update_set:
                resultado_set["codigoMesa"] = update_set["codigoMesa"]
            if "codigoRecinto" in update_set:
                resultado_set["codigoRecinto"] = update_set["codigoRecinto"]

            existing_res = resultados_col.find_one(
                {"actaId": acta.get("actaId")},
                {"ubicacion": 1},
            )
            if existing_res is not None:
                if _ubicacion_vacia(existing_res.get("ubicacion")) and resolution.get(
                    "resuelto"
                ):
                    resultado_set["ubicacion"] = _ubicacion_from_territorio(territorio)

                resultados_col.update_one(
                    {"actaId": acta.get("actaId")},
                    {"$set": resultado_set},
                )
                summary["resultadosUpdated"] += 1

    print()
    print("=" * 60)
    print("Resumen de reparacion territorial RRV")
    print("=" * 60)
    print(f"  modo:                                   {'DRY-RUN' if args.dry_run else 'WRITE'}")
    print(f"  actas escaneadas:                       {summary['totalScanned']}")
    print(f"  resueltas (territorio oficial):         {summary['resolved']}")
    print(f"  no resueltas:                           {summary['unresolved']}")
    print(
        "  codigoMesa recuperado desde filename:   "
        f"{summary['recoveredCodigoMesaFromFilename']}"
    )
    print(f"  actas con cambios:                      {summary['actasUpdated']}")
    print(f"  rrv_resultados actualizados:            {summary['resultadosUpdated']}")
    print(f"  sin cambios necesarios:                 {summary['noChange']}")

    if unresolved_reasons:
        print("\n  Motivos de no resolucion:")
        for motivo, total in sorted(
            unresolved_reasons.items(), key=lambda kv: kv[1], reverse=True
        ):
            print(f"    - {motivo}: {total}")

    print()


if __name__ == "__main__":
    main()
