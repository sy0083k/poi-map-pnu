# app/routers/auth.py
from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from app.dependencies import check_internal_network
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter()

# 1. 관리자 로그인 페이지 (중복 제거 후 하나만 남김)
@router.get("/admin/login", response_class=HTMLResponse, dependencies=[Depends(check_internal_network)])
async def login_page(request: Request):
    templates = request.app.state.templates
    return templates.TemplateResponse("login.html", {"request": request})

# 2. 로그인 처리 (POST)
@router.post("/login")
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    """로그인 처리 및 세션 생성 (해시 검증 방식)"""
    config = request.app.state.config

    # 1. 아이디 일치 확인
    is_id_match = (username == config.ADMIN_ID)
    
    # 2. 비밀번호 해시 검증 (평문 password와 해시된 ADMIN_PW 비교)
    # pwd_context.verify 함수가 내부적으로 복잡한 비교 과정을 처리합니다.
    is_pw_match = pwd_context.verify(password, config.ADMIN_PW_HASH)
    
    if is_id_match and is_pw_match:
        request.session["user"] = username
        return JSONResponse(content={"success": True})
        
    return JSONResponse(
        status_code=401, 
        content={"success": False, "message": "아이디 또는 비밀번호가 틀립니다."}
    )

@router.get("/logout")
async def logout(request: Request):
    request.session.clear()
    response = RedirectResponse(url="admin/login", status_code=303)
    response.delete_cookie("session", path="/")
    return response