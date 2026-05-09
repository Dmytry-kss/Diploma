from fastapi import APIRouter, HTTPException, Depends
from app.db.models import ProductCreate, ProductOut
from app.db.supabase import get_supabase
from app.api.deps import get_current_user
from typing import List

router = APIRouter()


@router.get("", response_model=List[ProductOut])
def get_products(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("products").select("*").order("created_at", desc=True).execute()
    return result.data


@router.post("", response_model=ProductOut, status_code=201)
def create_product(product: ProductCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("products").insert(product.model_dump()).execute()
    return result.data[0]


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("products").select("*").eq("id", product_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Product not found")
    return result.data


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("products").delete().eq("id", product_id).execute()
