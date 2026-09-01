from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.core.security import require_admin
from app.core.supabase_client import get_service_client
from app.services.compat import with_legacy_id, clean_list

router = APIRouter(prefix="/api/auth/customers", tags=["admin-users"])
# Kept at the OLD path (/api/auth/customers) so Parties.jsx's existing
# "Create portal login" button keeps working without a frontend change.
# Staff accounts get the equivalent under /api/admin/users below.


class CustomerLoginCreate(BaseModel):
    email: EmailStr
    password: str
    customer_name: str
    name: str = ""


@router.get("")
async def list_customer_logins(admin: dict = Depends(require_admin)):
    sb = get_service_client()
    res = sb.table("profiles").select("*").eq("role", "customer").order("created_at", desc=True).execute()
    return clean_list(res.data or [])


@router.post("")
async def create_customer_login(payload: CustomerLoginCreate, admin: dict = Depends(require_admin)):
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    sb = get_service_client()

    customer = (
        sb.table("customers").select("id").ilike("name", payload.customer_name.strip()).limit(1).execute()
    )
    if not customer.data:
        raise HTTPException(status_code=400, detail=f"No customer named '{payload.customer_name}' found")
    customer_id = customer.data[0]["id"]

    try:
        created = sb.auth.admin.create_user({
            "email": payload.email.strip().lower(),
            "password": payload.password,
            "email_confirm": True,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not create login: {e}")

    uid = created.user.id
    sb.table("profiles").update({
        "role": "customer",
        "customer_id": customer_id,
        "full_name": payload.name or payload.customer_name,
    }).eq("id", uid).execute()

    profile = sb.table("profiles").select("*").eq("id", uid).limit(1).execute()
    return with_legacy_id(profile.data[0]) if profile.data else {"id": uid}


@router.delete("/{uid}")
async def delete_customer_login(uid: str, admin: dict = Depends(require_admin)):
    sb = get_service_client()
    try:
        sb.auth.admin.delete_user(uid)
    except Exception:
        pass
    return {"ok": True}


staff_router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])


class StaffUserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""
    role: str = "staff"  # 'staff' or 'admin'


@staff_router.post("")
async def create_staff_user(payload: StaffUserCreate, admin: dict = Depends(require_admin)):
    if payload.role not in ("staff", "admin"):
        raise HTTPException(status_code=400, detail="role must be 'staff' or 'admin'")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    sb = get_service_client()
    try:
        created = sb.auth.admin.create_user({
            "email": payload.email.strip().lower(),
            "password": payload.password,
            "email_confirm": True,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not create user: {e}")
    uid = created.user.id
    sb.table("profiles").update({"role": payload.role, "full_name": payload.full_name}).eq("id", uid).execute()
    return {"id": uid, "email": payload.email, "role": payload.role}


@staff_router.get("")
async def list_staff_users(role: Optional[str] = None, admin: dict = Depends(require_admin)):
    sb = get_service_client()
    q = sb.table("profiles").select("*").in_("role", ["admin", "staff"])
    if role:
        q = sb.table("profiles").select("*").eq("role", role)
    res = q.order("created_at", desc=True).execute()
    return clean_list(res.data or [])
