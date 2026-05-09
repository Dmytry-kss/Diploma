import pandas as pd
from pytrends.request import TrendReq


def fetch_trends(keyword: str, start_date: str, end_date: str) -> pd.DataFrame:
    if not keyword:
        return pd.DataFrame(columns=["date", "search_interest"])
    try:
        pytrends = TrendReq(hl="uk-UA", tz=120, timeout=(10, 25))
        pytrends.build_payload([keyword], timeframe=f"{start_date} {end_date}")
        df = pytrends.interest_over_time()
        if df.empty:
            return pd.DataFrame(columns=["date", "search_interest"])
        df = df.reset_index()[["date", keyword]].rename(columns={keyword: "search_interest"})
        df["date"] = pd.to_datetime(df["date"])
        # pytrends returns weekly data — interpolate to daily
        df = df.set_index("date").resample("D").interpolate(method="linear").reset_index()
        df["date"] = df["date"].dt.strftime("%Y-%m-%d")
        return df
    except Exception:
        return pd.DataFrame(columns=["date", "search_interest"])
