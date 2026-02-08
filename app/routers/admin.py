# app/routers/admin.py
import os
import sqlite3
import shutil
import pandas as pd
from fastapi import APIRouter, Request, UploadFile, File, Depends, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse
from app.dependencies import is_authenticated
from app.utils import get_parcel_geom, update_geoms

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
async def upload_excel(request: Request, background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    config = request.app.state.config
    if not is_authenticated(request):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")
        
    try:
        df = pd.read_excel(file.file, sheet_name="목록")
        conn = sqlite3.connect(os.path.join(config.BASE_DIR, "data/database.db"))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM idle_land") # 기존 데이터 초기화
        
        print("🚀 엑셀 데이터 저장 시작...")        
        for _, row in df.iterrows():
            addr = row['소재지(지번)']        
            cursor.execute("""
                INSERT INTO idle_land (address, land_type, area, adm_property, gen_property, contact, geom) 
                VALUES (?,?,?,?,?,?,NULL)
            """, (str(addr), str(row['(공부상)지목']), float(row['(공부상)면적(㎡)']), 
                  str(row['행정재산']), str(row['일반재산']), str(row['담당자연락처'])))            
        conn.commit()      
        conn.close()
        
        # 🚀 핵심: 엑셀 저장이 끝나면 백그라운드 작업으로 경계선 획득 실행
        # 이 코드가 실행되면 서버는 클라이언트에게 즉시 응답을 보내고, 작업은 따로 수행됩니다.
        background_tasks.add_task(update_geoms, 5)
        
        return {
            "success": True,
            "total": len(df),
            "message": "엑셀 데이터 입력 완료"
        }

    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})