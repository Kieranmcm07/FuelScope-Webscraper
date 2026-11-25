import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    mode: str = "demo"
    client_id: str = ""
    client_secret: str = ""
    base_url: str = "https://www.fuel-finder.service.gov.uk"
    refresh_seconds: int = 1800
    data_dir: Path = ROOT / "data"
    geocoder_url: str = "https://api.postcodes.io"
    tile_url: str = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"

    @classmethod
    def from_env(cls):
        load_dotenv(ROOT / ".env")
        mode = os.getenv("FUEL_MODE", "auto").lower()
        cid = os.getenv("FUEL_FINDER_CLIENT_ID", "").strip()
        secret = os.getenv("FUEL_FINDER_CLIENT_SECRET", "").strip()
        if mode not in {"auto", "demo", "live"}:
            raise ValueError("FUEL_MODE must be auto, demo or live")
        if mode == "auto":
            mode = "live" if cid or secret else "demo"
        if mode == "live" and not (cid and secret):
            raise ValueError("Live mode requires both Fuel Finder credentials")
        base = os.getenv("FUEL_FINDER_BASE_URL", cls.base_url).rstrip("/")
        if not base.startswith("https://"):
            raise ValueError("Fuel Finder requires HTTPS")
        return cls(mode, cid, secret, base, max(900, int(os.getenv("REFRESH_SECONDS", "1800"))),
                   ROOT / os.getenv("DATA_DIR", "data"),
                   os.getenv("GEOCODER_URL", cls.geocoder_url).rstrip("/"),
                   os.getenv("MAP_TILE_URL", cls.tile_url))
