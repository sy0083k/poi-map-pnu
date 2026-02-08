from fastapi import Request, HTTPException, status

# 내부망 대역 정의 (나중에 Config 클래스로 옮기는 것을 추천)
ALLOWED_IP_PREFIXES = ["127.0.0.1", "192.168.", "10.10."] 

# 설정값 (나중에 Config 클래스에서 가져오는 방식으로 개선 가능)
ADMIN_ID = "admin"

def is_authenticated(request: Request):
    """세션 인증 확인"""
    # request.session을 사용하려면 main.py에 SessionMiddleware가 설정되어 있어야 합니다.
    user = request.cookies.get("session") # 현재 auth.py 로직 기준
    if user != "authenticated":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="로그인이 필요한 서비스입니다.",
            headers={"WWW-Authenticate": "Cookie"},
        )
    return True
    
def check_internal_network(request: Request):
    if not request.client:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Client Unknown"
        )

    client_ip = request.client.host
    is_allowed = any(client_ip.startswith(prefix) for prefix in ALLOWED_IP_PREFIXES)
    
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="관리자 페이지는 내부 행정망에서만 접근 가능합니다."
        )
    return True