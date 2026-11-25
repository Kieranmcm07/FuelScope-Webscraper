from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

Fuel = Literal["E10", "E5", "B7_STANDARD"]


def utcnow():
    return datetime.now(timezone.utc).isoformat()


class Price(BaseModel):
    fuel: Fuel
    price: float = Field(gt=0, lt=1000, allow_inf_nan=False)
    updated_at: datetime


class Station(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    brand: str
    address: str
    postcode: str
    city: str
    latitude: float = Field(ge=49, le=61, allow_inf_nan=False)
    longitude: float = Field(ge=-9, le=3, allow_inf_nan=False)
    closed: bool = False
    amenities: list[str] = []
    opening_times: dict = {}
    prices: list[Price] = []
