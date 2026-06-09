from pydantic import BaseModel


class LoginRequest(BaseModel):
    # str, а не EmailStr: при входе любой неверный ввод должен давать понятный
    # 401, а не 422 с массивом объектов-ошибок (его фронт не умел рендерить).
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    id: int
    email: str
    full_name: str
    is_founder: bool
    is_active: bool

    model_config = {"from_attributes": True}
