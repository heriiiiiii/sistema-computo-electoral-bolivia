from datetime import datetime, timezone
from uuid import uuid4
from app.repositories.rrv_repository import RRVRepository

class EventService:
    def __init__(self):
        self.repository = RRVRepository()

    def register_event(
        self,
        tipo,
        acta_id=None,
        codigo_mesa=None,
        mensaje=None,
        datos_referencia=None
    ):
        now = datetime.now(timezone.utc)

        event_data = {
            "eventId": f"EVT-{uuid4()}",
            "actaId": acta_id,
            "codigoMesa": codigo_mesa,
            "tipo": tipo,
            "mensaje": mensaje or tipo,
            "modulo": "RRV",
            "fechaHora": now,
            "datosReferencia": datos_referencia or {},
            "createdAt": now
        }

        inserted_id = self.repository.insert_event(event_data)

        return {
            "insertedId": inserted_id,
            "eventId": event_data["eventId"]
        }
