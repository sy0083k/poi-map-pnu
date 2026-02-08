# app/routers/admin.py
import os
import shutil
from fastapi import APIRouter, Request, UploadFile, File, Depends
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse

router = APIRouter()

@router.get("/", response_class=HTMLResponse)
async def admin_root(request: Request):
    # 1. 세션이나 쿠키를 확인하여 로그인 여부 체크
    # (세션 미들웨어를 사용 중이라면 request.session.get("user") 등으로 확인)
    config = request.app.state.config

    is_login = request.session.get("user") == config.ADMIN_ID

    if not is_login:
        # 2. 로그인이 안 되어 있다면 로그인 페이지로 리다이렉트
        # auth.py에 정의된 /admin/login 또는 /login으로 보냅니다.
        return RedirectResponse(url="/admin/login")

    # 3. 로그인 되어 있다면 관리자 페이지(admin.html) 반환
    templates = request.app.state.templates
    return templates.TemplateResponse("admin.html", {"request": request})

@router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...)):
    config = request.app.state.config
    
    # 1. 저장할 디렉토리 설정 (예: static/uploads)
    upload_dir = os.path.join(config.BASE_DIR, "static", "uploads")
    
    # 폴더가 없으면 생성
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)
        
    # 2. 파일 저장 경로
    file_path = os.path.join(upload_dir, file.filename)
    
    # 3. 파일 저장 실행
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": f"파일 저장 실패: {str(e)}"})
    finally:
        file.file.close()

    return {"message": "업로드 성공", "filename": file.filename}