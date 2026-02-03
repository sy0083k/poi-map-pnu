import sqlite3
import pandas as pd

def check_db():
    conn = sqlite3.connect('database.db')
    # pandas를 이용하면 표 형태로 예쁘게 출력됩니다.
    df = pd.read_sql_query("SELECT * FROM idle_land", conn)
    print(df)
    conn.close()

if __name__ == "__main__":
    check_db()