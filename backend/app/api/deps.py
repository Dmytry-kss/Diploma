from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from app.core.security import decode_token
from app.db.supabase import get_supabase

bearer_scheme = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    supabase = get_supabase()
    result = supabase.table("users").select("*").eq("id", user_id).single().execute()
    if not result.data:
        raise credentials_exception
    return result.data


def get_user_product(product_id: str, user_id: str, supabase) -> dict:
    """Fetch a product only if it belongs to the given user. Raises 404 otherwise."""
    result = supabase.table("products").select("*").eq("id", product_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Product not found")
    return result.data[0]


def get_user_forecast(forecast_id: str, user_id: str, supabase) -> dict:
    """Fetch a forecast only if its product belongs to the given user. Raises 404 otherwise."""
    forecast_result = supabase.table("forecasts").select("*").eq("id", forecast_id).execute()
    if not forecast_result.data:
        raise HTTPException(status_code=404, detail="Forecast not found")
    forecast = forecast_result.data[0]
    product_result = supabase.table("products").select("id").eq("id", forecast["product_id"]).eq("user_id", user_id).execute()
    if not product_result.data:
        raise HTTPException(status_code=404, detail="Forecast not found")
    return forecast
