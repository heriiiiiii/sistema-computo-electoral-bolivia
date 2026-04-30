"""
Dashboard routes — read-only endpoints consumed by 04-dashboard-avanzado.

All endpoints live under  /api/rrv/dashboard/*
They transform existing RRV data; no write operations.
"""

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.services.dashboard_service import DashboardService
from app.services.log_service import LogService

router = APIRouter(prefix="/api/rrv/dashboard", tags=["Dashboard RRV"])

dashboard_service = DashboardService()
log_service = LogService()


# ------------------------------------------------------------------
# GET /api/rrv/dashboard/resumen
# ------------------------------------------------------------------
@router.get("/resumen")
def dashboard_resumen():
    try:
        data = dashboard_service.get_resumen()
        return {"success": True, **data}
    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA", severidad="ERROR",
            mensaje="Error al generar resumen dashboard",
            detalle=str(error),
            datos_referencia={"endpoint": "GET /api/rrv/dashboard/resumen"}
        )
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": "Error interno al generar resumen dashboard",
            "codigoError": "ERROR_DASHBOARD_RESUMEN"
        })


# ------------------------------------------------------------------
# GET /api/rrv/dashboard/resultados-candidatos
# ------------------------------------------------------------------
@router.get("/resultados-candidatos")
def dashboard_resultados_candidatos():
    try:
        data = dashboard_service.get_resultados_candidatos()
        return {"success": True, "candidatos": data}
    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA", severidad="ERROR",
            mensaje="Error al generar resultados candidatos dashboard",
            detalle=str(error),
            datos_referencia={"endpoint": "GET /api/rrv/dashboard/resultados-candidatos"}
        )
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": "Error interno al generar resultados candidatos",
            "codigoError": "ERROR_DASHBOARD_CANDIDATOS"
        })


# ------------------------------------------------------------------
# GET /api/rrv/dashboard/estado-actas
# ------------------------------------------------------------------
@router.get("/estado-actas")
def dashboard_estado_actas():
    try:
        data = dashboard_service.get_estado_actas()
        return {"success": True, "estados": data}
    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA", severidad="ERROR",
            mensaje="Error al generar estado de actas dashboard",
            detalle=str(error),
            datos_referencia={"endpoint": "GET /api/rrv/dashboard/estado-actas"}
        )
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": "Error interno al generar estado de actas",
            "codigoError": "ERROR_DASHBOARD_ESTADO_ACTAS"
        })


# ------------------------------------------------------------------
# GET /api/rrv/dashboard/inconsistencias
# ------------------------------------------------------------------
@router.get("/inconsistencias")
def dashboard_inconsistencias(
    limit: int = Query(default=50, ge=1, le=200)
):
    try:
        data = dashboard_service.get_inconsistencias(limit=limit)
        return {"success": True, "total": len(data), "inconsistencias": data}
    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA", severidad="ERROR",
            mensaje="Error al generar inconsistencias dashboard",
            detalle=str(error),
            datos_referencia={"endpoint": "GET /api/rrv/dashboard/inconsistencias"}
        )
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": "Error interno al generar inconsistencias",
            "codigoError": "ERROR_DASHBOARD_INCONSISTENCIAS"
        })


# ------------------------------------------------------------------
# GET /api/rrv/dashboard/geografico
# ------------------------------------------------------------------
@router.get("/geografico")
def dashboard_geografico():
    try:
        data = dashboard_service.get_geografico()
        return {"success": True, "items": data}
    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA", severidad="ERROR",
            mensaje="Error al generar datos geograficos dashboard",
            detalle=str(error),
            datos_referencia={"endpoint": "GET /api/rrv/dashboard/geografico"}
        )
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": "Error interno al generar datos geograficos",
            "codigoError": "ERROR_DASHBOARD_GEOGRAFICO"
        })


# ------------------------------------------------------------------
# GET /api/rrv/dashboard/metricas-tecnicas
# ------------------------------------------------------------------
@router.get("/metricas-tecnicas")
def dashboard_metricas_tecnicas():
    try:
        data = dashboard_service.get_metricas_tecnicas()
        return {"success": True, **data}
    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA", severidad="ERROR",
            mensaje="Error al generar metricas tecnicas dashboard",
            detalle=str(error),
            datos_referencia={"endpoint": "GET /api/rrv/dashboard/metricas-tecnicas"}
        )
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": "Error interno al generar metricas tecnicas",
            "codigoError": "ERROR_DASHBOARD_METRICAS"
        })


# ------------------------------------------------------------------
# GET /api/rrv/dashboard/estado-clusters
# ------------------------------------------------------------------
@router.get("/estado-clusters")
def dashboard_estado_clusters():
    try:
        data = dashboard_service.get_estado_clusters()
        return {"success": True, "clusters": data}
    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA", severidad="ERROR",
            mensaje="Error al generar estado de clusters dashboard",
            detalle=str(error),
            datos_referencia={"endpoint": "GET /api/rrv/dashboard/estado-clusters"}
        )
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": "Error interno al generar estado de clusters",
            "codigoError": "ERROR_DASHBOARD_CLUSTERS"
        })


# ------------------------------------------------------------------
# GET /api/rrv/dashboard/actas-digitalizadas
# ------------------------------------------------------------------
@router.get("/actas-digitalizadas")
def dashboard_actas_digitalizadas(
    limit: int = Query(default=100, ge=1, le=500)
):
    try:
        data = dashboard_service.get_actas_digitalizadas(limit=limit)
        return {"success": True, "total": len(data), "actas": data}
    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA", severidad="ERROR",
            mensaje="Error al generar actas digitalizadas dashboard",
            detalle=str(error),
            datos_referencia={"endpoint": "GET /api/rrv/dashboard/actas-digitalizadas"}
        )
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": "Error interno al generar actas digitalizadas",
            "codigoError": "ERROR_DASHBOARD_ACTAS_DIGITALIZADAS"
        })


# ------------------------------------------------------------------
# GET /api/rrv/dashboard/kpis
# ------------------------------------------------------------------
@router.get("/kpis")
def dashboard_kpis():
    try:
        data = dashboard_service.get_kpis()
        return {"success": True, "kpis": data}
    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA", severidad="ERROR",
            mensaje="Error al generar KPIs dashboard",
            detalle=str(error),
            datos_referencia={"endpoint": "GET /api/rrv/dashboard/kpis"}
        )
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": "Error interno al generar KPIs",
            "codigoError": "ERROR_DASHBOARD_KPIS"
        })


# ------------------------------------------------------------------
# GET /api/rrv/dashboard/comparacion
# ------------------------------------------------------------------
@router.get("/comparacion")
def dashboard_comparacion():
    try:
        data = dashboard_service.get_comparacion()
        return {"success": True, **data}
    except Exception as error:
        log_service.register_log(
            tipo="SISTEMA", severidad="ERROR",
            mensaje="Error al generar comparacion dashboard",
            detalle=str(error),
            datos_referencia={"endpoint": "GET /api/rrv/dashboard/comparacion"}
        )
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": "Error interno al generar comparacion",
            "codigoError": "ERROR_DASHBOARD_COMPARACION"
        })
