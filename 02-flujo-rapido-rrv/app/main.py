from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config.settings import APP_NAME
from app.routes.health_routes import router as health_router
from app.routes.rrv_routes import router as rrv_router

app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(rrv_router)

@app.get("/")
def root():
    return {
        "success": True,
        "message": "Backend Flujo Rapido RRV funcionando"
    }
