from datetime import datetime, timezone
from uuid import uuid4
from app.repositories.rrv_repository import RRVRepository
from app.utils.mongo_utils import serialize_mongo_documents
from app.utils.source_utils import default_log_source

class LogService:
    def __init__(self):
        self.repository = RRVRepository()

    def register_log(
        self,
        tipo,
        severidad,
        mensaje,
        detalle=None,
        acta_id=None,
        codigo_mesa=None,
        datos_referencia=None,
        source=None,
    ):
        now = datetime.now(timezone.utc)

        endpoint_referencia = (datos_referencia or {}).get("endpoint")

        if source is None:
            source = default_log_source(
                tipo=tipo,
                mensaje=mensaje,
                endpoint=endpoint_referencia,
            )

        log_data = {
            "logId": f"LOG-{uuid4()}",
            "actaId": acta_id,
            "codigoMesa": codigo_mesa,
            "tipo": tipo,
            "severidad": severidad,
            "mensaje": mensaje,
            "detalle": detalle,
            "modulo": "RRV",
            "fechaHora": now,
            "datosReferencia": datos_referencia or {},
            "source": source,
            "createdAt": now
        }

        inserted_id = self.repository.insert_log(log_data)

        return {
            "insertedId": inserted_id,
            "logId": log_data["logId"]
        }

    def list_logs(self, filters=None, limit=50):
        logs = self.repository.find_logs(filters=filters, limit=limit)
        return serialize_mongo_documents(logs)
