from fastapi import APIRouter, HTTPException, status
from app.db.models import UserCreate, UserOut, Token
from app.db.supabase import get_supabase
from app.core.security import hash_password, verify_password, create_access_token
from app.api.deps import get_current_user
from fastapi import Depends

router = APIRouter()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(user: UserCreate):
    supabase = get_supabase()
    existing = supabase.table("users").select("id").eq("email", user.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = hash_password(user.password)
    result = supabase.table("users").insert({
        "email": user.email,
        "hashed_password": hashed,
        "full_name": user.full_name,
    }).execute()
    return result.data[0]


@router.post("/login", response_model=Token)
def login(user: UserCreate):
    supabase = get_supabase()
    result = supabase.table("users").select("*").eq("email", user.email).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    db_user = result.data[0]
    if not verify_password(user.password, db_user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": db_user["id"]})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def me(current_user: dict = Depends(get_current_user)):
    return current_user
