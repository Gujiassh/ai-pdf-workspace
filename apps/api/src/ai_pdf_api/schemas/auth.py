from pydantic import BaseModel, EmailStr, Field


class AuthUser(BaseModel):
    id: str
    email: EmailStr
    name: str
    avatarUrl: str


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=6, max_length=128)


class RegisterResponse(BaseModel):
    user: AuthUser


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginResponse(BaseModel):
    user: AuthUser
