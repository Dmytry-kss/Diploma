import pandas as pd


def build_feature_matrix(
    sales_df: pd.DataFrame,
    weather_df: pd.DataFrame,
    trends_df: pd.DataFrame,
) -> pd.DataFrame:
    df = sales_df[["date", "quantity"]].copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    df["day_of_week"] = df["date"].dt.dayofweek
    df["month"] = df["date"].dt.month
    df["week_of_year"] = df["date"].dt.isocalendar().week.astype(int)
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["lag_7"] = df["quantity"].shift(7).fillna(0)
    df["lag_14"] = df["quantity"].shift(14).fillna(0)
    df["lag_30"] = df["quantity"].shift(30).fillna(0)
    df["rolling_7"] = df["quantity"].rolling(7, min_periods=1).mean()
    df["rolling_14"] = df["quantity"].rolling(14, min_periods=1).mean()

    if not weather_df.empty:
        w = weather_df.copy()
        w["date"] = pd.to_datetime(w["date"])
        df = df.merge(w[["date", "temperature", "precipitation", "uv_index"]], on="date", how="left")
        df["temperature"] = df["temperature"].ffill().fillna(0.0)
        df["precipitation"] = df["precipitation"].fillna(0.0)
        df["uv_index"] = df["uv_index"].fillna(0.0)
    else:
        df["temperature"] = 0.0
        df["precipitation"] = 0.0
        df["uv_index"] = 0.0

    if not trends_df.empty:
        t = trends_df.copy()
        t["date"] = pd.to_datetime(t["date"])
        df = df.merge(t[["date", "search_interest"]], on="date", how="left")
        df["search_interest"] = df["search_interest"].fillna(0.0)
    else:
        df["search_interest"] = 0.0

    return df
