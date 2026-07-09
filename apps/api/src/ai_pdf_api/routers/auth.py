from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ai_pdf_api.core.security import hash_password, verify_password
from ai_pdf_api.db.session import get_db
from ai_pdf_api.models import User
from ai_pdf_api.schemas.auth import AuthUser, LoginRequest, LoginResponse, RegisterRequest, RegisterResponse

router = APIRouter(prefix="/v1/auth", tags=["auth"])


def to_auth_user(user: User) -> AuthUser:
    return AuthUser(
        id=user.id,
        email=user.email,
        name=user.name,
        avatarUrl=user.avatar_url,
    )


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered.",
        )

    normalized_email = payload.email.lower()
    user = User(
        email=normalized_email,
        name=payload.name.strip(),
        password_hash=hash_password(payload.password),
        avatar_url=f"https://api.dicebear.com/7.x/bottts/svg?seed={normalized_email}",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return RegisterResponse(user=to_auth_user(user))


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    return LoginResponse(user=to_auth_user(user))
