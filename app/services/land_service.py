import json
from typing import Any, cast

from app.db.connection import db_connection
from app.repositories import idle_land_repository
from app.types import GeoJSONFeature, GeoJSONFeatureCollection

PUBLIC_LAND_FIELDS = {"id", "address", "land_type", "area", "adm_property", "gen_property", "contact"}


def get_public_land_features() -> GeoJSONFeatureCollection:
    with db_connection(row_factory=True) as conn:
        rows = idle_land_repository.fetch_lands_with_geom(conn)

    features: list[GeoJSONFeature] = []
    for row in rows:
        geometry = cast(dict[str, Any], json.loads(row["geom"]))
        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": {key: row[key] for key in row.keys() if key in PUBLIC_LAND_FIELDS},
            }
        )
    return {"type": "FeatureCollection", "features": features}
