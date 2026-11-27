
"""
REST API endpoints for TEJAS plant management.

POST   /plants              Register a new plant
GET    /plants              List all plants
GET    /plants/{plant_id}   Get one plant
PUT    /plants/{plant_id}   Partially update a plant
DELETE /plants/{plant_id}   Delete a plant
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from plants.database import get_db
from plants.models import Plant
from plants.schemas import PlantCreate, PlantResponse, PlantUpdate


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plants", tags=["Plants"])

DbSession = Annotated[Session, Depends(get_db)]


# --------------------------------------------------
# Helper functions
# --------------------------------------------------

def plant_to_response(plant: Plant) -> PlantResponse:
    """Convert a database Plant object into a PlantResponse."""

    return PlantResponse(
        plant_id=plant.plant_id,
        plant_name=plant.plant_name,
        plant_type=plant.plant_type,
        latitude=plant.latitude,
        longitude=plant.longitude,
        installed_capacity_mw=plant.installed_capacity_mw,
        tilt=plant.tilt,
        azimuth=plant.azimuth,
    )


def get_plant_or_404(db: Session, plant_id: str) -> Plant:
    """Find a plant or return HTTP 404."""

    plant = db.scalars(
        select(Plant).where(Plant.plant_id == plant_id)
    ).first()

    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plant not found.",
        )

    return plant


def raise_database_error(
    db: Session,
    error: SQLAlchemyError,
    action: str,
):
    """Rollback and return a safe database error."""

    db.rollback()

    logger.error(
        "Database error while %s: %s",
        action,
        type(error).__name__,
    )

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="A database error occurred. Please try again later.",
    ) from None


# --------------------------------------------------
# 1. POST /plants - Register a plant
# --------------------------------------------------

@router.post(
    "",
    response_model=PlantResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_plant(data: PlantCreate, db: DbSession):

    plant = Plant(
        plant_id=data.plant_id,
        plant_name=data.plant_name,
        plant_type=data.plant_type,
        latitude=data.latitude,
        longitude=data.longitude,
        installed_capacity_mw=data.installed_capacity_mw,
        tilt=data.tilt,
        azimuth=data.azimuth,
    )

    try:
        db.add(plant)
        db.commit()
        db.refresh(plant)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A plant with this plant_id already exists.",
        ) from None

    except SQLAlchemyError as error:
        raise_database_error(db, error, "creating a plant")

    return plant_to_response(plant)


# --------------------------------------------------
# 2. GET /plants - List all plants
# --------------------------------------------------

@router.get("", response_model=list[PlantResponse])
def list_plants(db: DbSession):

    try:
        plants = db.scalars(
            select(Plant).order_by(Plant.id)
        ).all()

        return [plant_to_response(plant) for plant in plants]

    except SQLAlchemyError as error:
        raise_database_error(db, error, "listing plants")


# --------------------------------------------------
# 3. GET /plants/{plant_id} - Get one plant
# --------------------------------------------------

@router.get(
    "/{plant_id}",
    response_model=PlantResponse,
)
def get_plant(plant_id: str, db: DbSession):

    try:
        plant = get_plant_or_404(db, plant_id)
        return plant_to_response(plant)

    except SQLAlchemyError as error:
        raise_database_error(db, error, "reading a plant")


# --------------------------------------------------
# 4. PUT /plants/{plant_id} - Update a plant
# --------------------------------------------------

@router.put(
    "/{plant_id}",
    response_model=PlantResponse,
)
def update_plant(
    plant_id: str,
    data: PlantUpdate,
    db: DbSession,
):

    try:
        plant = get_plant_or_404(db, plant_id)

        # Only update fields supplied by the user.
        changes = data.model_dump(exclude_unset=True)

        for field_name, value in changes.items():
            setattr(plant, field_name, value)

        db.commit()
        db.refresh(plant)

        return plant_to_response(plant)

    except SQLAlchemyError as error:
        raise_database_error(db, error, "updating a plant")


# --------------------------------------------------
# 5. DELETE /plants/{plant_id} - Delete a plant
# --------------------------------------------------

@router.delete(
    "/{plant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_plant(plant_id: str, db: DbSession):

    try:
        plant = get_plant_or_404(db, plant_id)

        db.delete(plant)
        db.commit()

        return Response(status_code=status.HTTP_204_NO_CONTENT)

    except SQLAlchemyError as error:
        raise_database_error(db, error, "deleting a plant")
