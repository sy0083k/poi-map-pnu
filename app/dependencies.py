from fastapi import Request, HTTPException, status

# 설정값 (나중에 Config 클래스에서 가져오는 방식으로 개선 가능)
def is_authenticated(request: Request):
    """세션 인증 확인"""
    config = request.app.state.config
    return request.session.get("user") == config.ADMIN_ID
    
def check_internal_network(request: Request):
    config = request.app.state.config
    if not request.client:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Client Unknown"
        )

    client_ip = request.client.host
    is_allowed = any(client_ip.startswith(prefix) for prefix in config.ALLOWED_IP_PREFIXES)
    
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="관리자 페이지는 내부 행정망에서만 접근 가능합니다."
        )
    return True