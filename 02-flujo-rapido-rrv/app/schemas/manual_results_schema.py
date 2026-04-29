from typing import List, Optional
from pydantic import BaseModel, field_validator


class VotoPartidoInput(BaseModel):
    partidoCodigo: str
    cantidadVotos: int

    @field_validator("cantidadVotos")
    @classmethod
    def votos_no_negativos(cls, v):
        if v < 0:
            raise ValueError("cantidadVotos no puede ser negativo")
        return v


class ManualResultsRequest(BaseModel):
    votosPartidos: List[VotoPartidoInput]
    votosValidos: int
    votosBlancos: int
    votosNulos: int
    operadorId: Optional[str] = None
    observacion: Optional[str] = None

    @field_validator("votosValidos", "votosBlancos", "votosNulos")
    @classmethod
    def totales_no_negativos(cls, v):
        if v < 0:
            raise ValueError("El valor no puede ser negativo")
        return v
