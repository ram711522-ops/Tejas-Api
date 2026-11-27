from plants.database import Base, get_engine
from plants.models import Plant
from readings.models import Reading
from forecasts.models import Forecast
from alerts.models import Alert
from alerts.models import Alert


def create_tables():
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully!")


if __name__ == "__main__":
    create_tables()