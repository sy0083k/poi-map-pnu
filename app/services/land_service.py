import json

from app.db.connection import db_connection
from app.repositories import idle_land_repository

PUBLIC_LAND_FIELDS = {"id", "address", "land_type", "area", "adm_property", "gen_property", "contact"}


def get_public_land_features() -> dict:
    with db_connection(row_factory=True) as conn:
        rows = idle_land_repository.fetch_lands_with_geom(conn)

    features = []
    for row in rows:
        features.append(
            {
                "type": "Feature",
                "geometry": json.loads(row["geom"]),
                "properties": {key: row[key] for key in row.keys() if key in PUBLIC_LAND_FIELDS},
            }
        )
    return {"type": "FeatureCollection", "features": features}
