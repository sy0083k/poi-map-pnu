import bcrypt

# [입력] 사용할 실제 비밀번호
plain_password = "사용할_강력한_비밀번호"

# 1. 비밀번호를 바이트(bytes) 형태로 변환 (필수)
password_bytes = plain_password.encode('utf-8')

# 2. 솔트(Salt) 생성 및 해싱
salt = bcrypt.gensalt()
hashed_password = bcrypt.hashpw(password_bytes, salt)

# 3. 결과 출력 (이 값을 .env에 저장하세요)
print(f"생성된 해시값: {hashed_password.decode('utf-8')}")