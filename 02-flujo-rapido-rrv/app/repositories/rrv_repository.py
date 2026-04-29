from datetime import datetime, timezone
from pymongo import DESCENDING
from app.config.database import get_collection
from app.constants.rrv_constants import COLECCIONES_RRV


class RRVRepository:
    def __init__(self):
        self.actas = get_collection(COLECCIONES_RRV["actas"])
        self.sms = get_collection(COLECCIONES_RRV["sms"])
        self.eventos = get_collection(COLECCIONES_RRV["eventos"])
        self.logs = get_collection(COLECCIONES_RRV["logs"])
        self.resultados = get_collection(COLECCIONES_RRV["resultados"])

    def insert_acta(self, acta_data):
        result = self.actas.insert_one(acta_data)
        return str(result.inserted_id)

    def find_acta_by_id(self, acta_id):
        return self.actas.find_one({"actaId": acta_id})

    def find_acta_by_hash(self, hash_archivo):
        return self.actas.find_one({"archivo.hashArchivo": hash_archivo})

    def find_actas_by_codigo_mesa(self, codigo_mesa):
        return list(self.actas.find({"codigoMesa": codigo_mesa}))

    def update_acta_by_id(self, acta_id, update_data):
        result = self.actas.update_one(
            {"actaId": acta_id},
            update_data
        )
        return result.modified_count

    def list_actas(self, filters=None, limit=50):
        query = filters or {}

        cursor = (
            self.actas
            .find(query)
            .sort("createdAt", DESCENDING)
            .limit(limit)
        )

        return list(cursor)

    def mark_conflicting_actas_as_suspicious(self, codigo_mesa, hash_archivo, except_acta_id):
        now = datetime.now(timezone.utc)

        query = {
            "actaId": {"$ne": except_acta_id},
            "$or": [
                {"codigoMesa": codigo_mesa},
                {"archivo.hashArchivo": hash_archivo}
            ]
        }

        error = {
            "codigo": "CONFLICTO_MESA_O_HASH",
            "descripcion": "Existe más de un acta asociada a la misma mesa o al mismo hash de archivo",
            "severidad": "WARNING"
        }

        result = self.actas.update_many(
            query,
            {
                "$set": {
                    "estado": "SOSPECHOSA",
                    "validacion.esDuplicada": True,
                    "validacion.esSospechosa": True,
                    "validacion.requiereRevisionManual": True,
                    "updatedAt": now
                },
                "$addToSet": {
                    "validacion.errores": error,
                    "validacion.reglasEjecutadas": "DETECCION_DUPLICADOS"
                }
            }
        )

        return result.modified_count

    def insert_sms(self, sms_data):
        result = self.sms.insert_one(sms_data)
        return str(result.inserted_id)

    def find_sms_by_id(self, sms_id):
        return self.sms.find_one({"smsId": sms_id})

    def find_sms_by_codigo_mesa(self, codigo_mesa):
        return list(self.sms.find({"codigoMesa": codigo_mesa}))

    def update_sms_by_id(self, sms_id, update_data):
        result = self.sms.update_one(
            {"smsId": sms_id},
            update_data
        )
        return result.modified_count

    def list_sms(self, filters=None, limit=50):
        query = filters or {}

        cursor = (
            self.sms
            .find(query)
            .sort("createdAt", DESCENDING)
            .limit(limit)
        )

        return list(cursor)

    def insert_event(self, event_data):
        result = self.eventos.insert_one(event_data)
        return str(result.inserted_id)

    def insert_log(self, log_data):
        result = self.logs.insert_one(log_data)
        return str(result.inserted_id)

    def find_logs(self, filters=None, limit=50):
        query = filters or {}

        cursor = (
            self.logs
            .find(query)
            .sort("fechaHora", DESCENDING)
            .limit(limit)
        )

        return list(cursor)