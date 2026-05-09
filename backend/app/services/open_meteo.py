import httpx
import pandas as pd
from datetime import date


async def fetch_weather(lat: float, lon: float, start_date: str, end_date: str) -> pd.DataFrame:
    today = date.today().isoformat()
    dfs = []

    if start_date <= today:
        hist_end = min(end_date, today)
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    "https://archive-api.open-meteo.com/v1/archive",
                    params={
                        "latitude": lat,
                        "longitude": lon,
                        "start_date": start_date,
                        "end_date": hist_end,
                        "daily": "temperature_2m_max,precipitation_sum,uv_index_max",
                        "timezone": "Europe/Kiev",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                if "daily" in data:
                    df = pd.DataFrame(data["daily"])
                    df.rename(columns={
                        "time": "date",
                        "temperature_2m_max": "temperature",
                        "precipitation_sum": "precipitation",
                        "uv_index_max": "uv_index",
                    }, inplace=True)
                    dfs.append(df)
        except Exception:
            pass

    if end_date > today:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    "https://api.open-meteo.com/v1/forecast",
                    params={
                        "latitude": lat,
                        "longitude": lon,
                        "daily": "temperature_2m_max,precipitation_sum,uv_index_max",
                        "timezone": "Europe/Kiev",
                        "forecast_days": 16,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                if "daily" in data:
                    df = pd.DataFrame(data["daily"])
                    df.rename(columns={
                        "time": "date",
                        "temperature_2m_max": "temperature",
                        "precipitation_sum": "precipitation",
                        "uv_index_max": "uv_index",
                    }, inplace=True)
                    df = df[df["date"] > today].copy()
                    dfs.append(df)
        except Exception:
            pass

    if not dfs:
        return pd.DataFrame(columns=["date", "temperature", "precipitation", "uv_index"])

    result = pd.concat(dfs, ignore_index=True).drop_duplicates("date")
    result["date"] = pd.to_datetime(result["date"]).dt.strftime("%Y-%m-%d")
    for col in ["temperature", "precipitation", "uv_index"]:
        result[col] = pd.to_numeric(result[col], errors="coerce").fillna(0.0)
    return result[["date", "temperature", "precipitation", "uv_index"]]
