from fastapi import APIRouter, HTTPException, Depends
from app.db.models import ProductCreate, ProductOut
from app.db.supabase import get_supabase
from app.api.deps import get_current_user, get_user_product
from typing import List

router = APIRouter()


@router.get("", response_model=List[ProductOut])
def get_products(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("products").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
    return result.data


@router.post("", response_model=ProductOut, status_code=201)
def create_product(product: ProductCreate, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    data = product.model_dump()
    data["user_id"] = current_user["id"]
    result = supabase.table("products").insert(data).execute()
    return result.data[0]


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    return get_user_product(product_id, current_user["id"], supabase)


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    get_user_product(product_id, current_user["id"], supabase)
    supabase.table("products").delete().eq("id", product_id).eq("user_id", current_user["id"]).execute()
