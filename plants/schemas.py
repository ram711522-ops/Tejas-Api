"""
Pydantic schemas for TEJAS plant management.

A schema is a "form" that describes what plant data must look like.
FastAPI will later use these forms to check incoming data automatically
and to shape the data we send back.

Three schemas:
    PlantCreate   - data needed to register a new plant
    PlantUpdate   - data allowed when changing an existing plant (partial)
    PlantResponse - plant data returned to the caller

This file has NO database code and NO API endpoints.
"""

from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)


# --------------------------------------------------
# 1. Reusable field rules
# --------------------------------------------------
# Defined once here so Create, Update and Response always use the same rules.

# Plant ID: letters, digits, "-" and "_" only (it will be used inside URLs
# later, e.g. /plants/PLANT-001). Surrounding spaces are removed.
PlantId = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=50,
        pattern=r"^[A-Za-z0-9_-]+$",
    ),
]

# Non-empty text. "   " (only spaces) becomes "" after stripping, so it fails.
PlantName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
]

PlantType = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=50),
]

# allow_inf_nan=False rejects the special values NaN and Infinity.
Latitude = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
Longitude = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
CapacityMW = Annotated[float, Field(gt=0, allow_inf_nan=False)]
Tilt = Annotated[float, Field(ge=0, le=90, allow_inf_nan=False)]
Azimuth = Annotated[float, Field(ge=0, le=360, allow_inf_nan=False)]


# --------------------------------------------------
# 2. Fields shared by create and response
# --------------------------------------------------

class PlantBase(BaseModel):
    plant_name: PlantName
    latitude: Latitude
    longitude: Longitude
    installed_capacity_mw: CapacityMW
    plant_type: PlantType
    tilt: Tilt | None = None
    azimuth: Azimuth | None = None


# --------------------------------------------------
# 3. Create: registering a new plant
# --------------------------------------------------

class PlantCreate(PlantBase):
    # Unknown fields (for example a typo like "tilt_angle") are rejected
    # instead of being silently ignored.
    model_config = ConfigDict(extra="forbid")

    plant_id: PlantId


# --------------------------------------------------
# 4. Update: changing an existing plant (partial update)
# --------------------------------------------------

class PlantUpdate(BaseModel):
    """
    Every field is optional, so the caller sends only what should change.
    Any value that IS sent is checked with the same rules as in PlantCreate.

    plant_id is intentionally missing: it is the plant's permanent identity
    and cannot be changed. Sending it will be rejected (extra="forbid").
    """

    model_config = ConfigDict(extra="forbid")

    plant_name: PlantName | None = None
    latitude: Latitude | None = None
    longitude: Longitude | None = None
    installed_capacity_mw: CapacityMW | None = None
    plant_type: PlantType | None = None
    tilt: Tilt | None = None
    azimuth: Azimuth | None = None

    @model_validator(mode="after")
    def check_update_is_meaningful(self):
        # "fields_set" = the fields the caller actually sent.
        sent = self.model_fields_set

        # An empty update ({}) would change nothing.
        if not sent:
            raise ValueError("Send at least one field to update.")

        # Required fields may be changed, but never erased with null.
        required_fields = {
            "plant_name",
            "latitude",
            "longitude",
            "installed_capacity_mw",
            "plant_type",
        }
        for name in sorted(required_fields & sent):
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null.")

        # tilt and azimuth are optional in the plant itself, so sending null
        # for them is allowed and means "clear this value".
        return self


# --------------------------------------------------
# 5. Response: plant information sent back to the caller
# --------------------------------------------------

class PlantResponse(PlantBase):
    model_config = ConfigDict(from_attributes=True)

    plant_id: str