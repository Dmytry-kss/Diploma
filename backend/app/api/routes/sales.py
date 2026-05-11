from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from app.db.supabase import get_supabase
from app.api.deps import get_current_user, get_user_product
from app.db.models import SaleOut
from typing import List
import pandas as pd
import io

router = APIRouter()


def validate_csv(df: pd.DataFrame) -> dict:
    """Validate CSV structure and data quality."""
    errors = []
    warnings = []

    REQUIRED_COLUMNS = ["date", "quantity"]

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        errors.append(f"Відсутні обов'язкові колонки: {missing}")
        return {"errors": errors, "warnings": warnings, "valid": False}

    try:
        pd.to_datetime(df["date"])
    except Exception:
        errors.append("Колонка 'date' містить некоректний формат дати (очікується YYYY-MM-DD)")

    numeric_check = pd.to_numeric(df["quantity"], errors="coerce")
    if not numeric_check.notna().all():
        errors.append("Колонка 'quantity' містить нечислові значення")

    missing_pct = df["quantity"].isna().mean() * 100
    if missing_pct > 0:
        warnings.append(f"Знайдено {missing_pct:.1f}% пропущених значень — буде заповнено інтерполяцією")

    if len(df) < 90:
        warnings.append(f"Мало даних ({len(df)} рядків) — рекомендується мінімум 90 днів для точного прогнозу")

    return {"errors": errors, "warnings": warnings, "valid": len(errors) == 0}


@router.post("/upload/{product_id}", status_code=201)
async def upload_sales(
    product_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    get_user_product(product_id, current_user["id"], supabase)

    content = await file.read()
    try:
        df = pd.read_csv(io.StringIO(content.decode("utf-8")))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid CSV file")

    validation = validate_csv(df)
    if not validation["valid"]:
        raise HTTPException(status_code=422, detail={
            "message": "CSV validation failed",
            "errors": validation["errors"],
            "warnings": validation["warnings"]
        })

    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    df["quantity"] = df["quantity"].astype(int)
    df["product_id"] = product_id
    if "price" not in df.columns:
        df["price"] = None

    records = df[["product_id", "date", "quantity", "price"]].to_dict(orient="records")

    supabase.table("sales").upsert(records, on_conflict="product_id,date").execute()

    return {
        "inserted": len(records),
        "warnings": validation["warnings"]
    }


@router.get("/{product_id}", response_model=List[SaleOut])
def get_sales(product_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    get_user_product(product_id, current_user["id"], supabase)
    result = supabase.table("sales").select("*").eq("product_id", product_id).order("date").execute()
    return result.data


@router.delete("/{product_id}", status_code=204)
def delete_sales(product_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    get_user_product(product_id, current_user["id"], supabase)
    supabase.table("sales").delete().eq("product_id", product_id).execute()


@router.get("/{product_id}/stats")
def get_sales_stats(product_id: str, current_user: dict = Depends(get_current_user)):
    from app.db.models import DatasetStatsResponse
    import numpy as np

    supabase = get_supabase()
    get_user_product(product_id, current_user["id"], supabase)

    result = supabase.table("sales").select("date,quantity").eq("product_id", product_id).order("date").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No sales data found for this product")

    df = pd.DataFrame(result.data)
    df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce")

    total_rows = len(df)
    date_from = df["date"].min()
    date_to = df["date"].max()
    missing_values = int(df["quantity"].isna().sum())
    mean_quantity = float(df["quantity"].mean())
    std_quantity = float(df["quantity"].std())
    min_quantity = float(df["quantity"].min())
    max_quantity = float(df["quantity"].max())

    sufficient_for_forecast = total_rows >= 90

    seasonality_detected = False
    if total_rows > 90:
        try:
            df["date"] = pd.to_datetime(df["date"])
            df = df.set_index("date")
            weekly = df["quantity"].resample("W").mean()
            if len(weekly) > 4:
                weekly_std = weekly.std()
                weekly_mean = weekly.mean()
                seasonality_detected = (weekly_std / weekly_mean) > 0.15 if weekly_mean > 0 else False
        except Exception:
            seasonality_detected = False

    return DatasetStatsResponse(
        product_id=product_id,
        total_rows=total_rows,
        date_from=date_from,
        date_to=date_to,
        missing_values=missing_values,
        mean_quantity=round(mean_quantity, 2),
        std_quantity=round(std_quantity, 2),
        min_quantity=round(min_quantity, 2),
        max_quantity=round(max_quantity, 2),
        seasonality_detected=seasonality_detected,
        sufficient_for_forecast=sufficient_for_forecast,
    )
