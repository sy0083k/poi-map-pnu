import os
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from app.routers import map_router, auth, admin
from starlette.middleware.sessions import SessionMiddleware

load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key")

app = FastAPI()

app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY, max_age=None, https_only=True)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# (기존 CSP 미들웨어 및 라우트 로직들...)
class Config:
    APP_NAME = os.getenv("APP_NAME")
    CENTER_LON = os.getenv("MAP_CENTER_LON", 126.4500)
    CENTER_LAT = os.getenv("MAP_CENTER_LAT", 36.7848)
    DEFAULT_ZOOM = os.getenv("MAP_DEFAULT_ZOOM")
    VWORLD_KEY = os.getenv("VWORLD_KEY")
    BASE_DIR = BASE_DIR
    ADMIN_ID = os.getenv("ADMIN_ID")
    ADMIN_PW_HASH = os.getenv("ADMIN_PW_HASH")

app.state.config = Config()
app.state.templates = templates

app.include_router(auth.router, tags=["Authentication"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(map_router.router, prefix="/api", tags=["Map"])

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# uvicorn app.main:app --reload