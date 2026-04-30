from fastapi import APIRouter
from app.config.database import check_mongodb_connection

router = APIRouter(prefix="/api/rrv", tags=["RRV Health"])

@router.get("/health")
def health_check():
    try:
        mongodb = check_mongodb_connection()

        return {
            "success": True,
            "service": "Flujo Rapido RRV",
            "mongodb": mongodb
        }
    except Exception as error:
        return {
            "success": False,
            "service": "Flujo Rapido RRV",
            "mongodb": {
                "status": "ERROR",
                "error": str(error)
            }
        }
