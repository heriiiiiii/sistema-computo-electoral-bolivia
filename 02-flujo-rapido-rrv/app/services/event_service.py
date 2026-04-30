from datetime import datetime, timezone
from uuid import uuid4
from app.repositories.rrv_repository import RRVRepository
from app.utils.source_utils import default_event_source

class EventService:
    def __init__(self):
        self.repository = RRVRepository()

    def register_event(
        self,
        tipo,
        acta_id=None,
        codigo_mesa=None,
        mensaje=None,
        datos_referencia=None,
        source=None,
    ):
        now = datetime.now(timezone.utc)

        endpoint_referencia = (datos_referencia or {}).get("endpoint")

        if source is None:
            source = default_event_source(
                tipo_evento=tipo,
                mensaje=mensaje or tipo,
                endpoint=endpoint_referencia,
            )

        event_data = {
            "eventId": f"EVT-{uuid4()}",
            "actaId": acta_id,
            "codigoMesa": codigo_mesa,
            "tipo": tipo,
            "mensaje": mensaje or tipo,
            "modulo": "RRV",
            "fechaHora": now,
            "datosReferencia": datos_referencia or {},
            "source": source,
            "createdAt": now
        }

        inserted_id = self.repository.insert_event(event_data)

        return {
            "insertedId": inserted_id,
            "eventId": event_data["eventId"]
        }
