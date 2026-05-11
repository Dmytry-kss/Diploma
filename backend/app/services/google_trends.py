import time
import random
import logging
import pandas as pd
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://trends.google.com/",
}


def _try_pytrends(keyword: str, start_date: str, end_date: str) -> pd.DataFrame:
    from pytrends.request import TrendReq

    pytrends = TrendReq(
        hl="uk-UA",
        tz=120,
        timeout=(15, 30),
        requests_args={"headers": _HEADERS},
    )
    # Small delay to reduce chance of 429
    time.sleep(random.uniform(1.5, 3.0))
    pytrends.build_payload([keyword], timeframe=f"{start_date} {end_date}")
    df = pytrends.interest_over_time()
    if df.empty:
        return pd.DataFrame(columns=["date", "search_interest"])

    df = df.reset_index()[["date", keyword]].rename(columns={keyword: "search_interest"})
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").resample("D").interpolate(method="linear").reset_index()
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")
    return df


def _synthetic_fallback(start_date: str, end_date: str) -> pd.DataFrame:
    """
    Generate plausible seasonal search-interest proxy when Google Trends is
    unavailable.  Values are centred at 50 with ±20 weekly seasonality and
    ±10 random noise — enough to let Prophet detect the regressor direction
    without introducing misleading strong trends.
    """
    dates = pd.date_range(start=start_date, end=end_date, freq="D")
    if len(dates) == 0:
        return pd.DataFrame(columns=["date", "search_interest"])

    rng = random.Random(42)
    values = []
    for d in dates:
        # Weekly seasonality: higher Mon-Fri, lower weekend
        weekly = 10 * (1 - d.weekday() / 6)
        # Gentle annual seasonality
        annual = 10 * (0.5 + 0.5 * ((d.timetuple().tm_yday / 365) * 2 - 1))
        noise = rng.gauss(0, 5)
        values.append(max(0.0, min(100.0, 50.0 + weekly + annual + noise)))

    df = pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "search_interest": values})
    return df


def fetch_trends(keyword: str, start_date: str, end_date: str) -> pd.DataFrame:
    if not keyword:
        return pd.DataFrame(columns=["date", "search_interest"])

    # Try pytrends up to 2 times
    for attempt in range(2):
        try:
            df = _try_pytrends(keyword, start_date, end_date)
            if not df.empty:
                logger.info("Google Trends: fetched %d rows for '%s'", len(df), keyword)
                return df
        except Exception as exc:
            logger.warning("Google Trends attempt %d failed: %s", attempt + 1, exc)
            if attempt == 0:
                time.sleep(random.uniform(5, 10))

    # Fallback: synthetic seasonal proxy
    logger.warning(
        "Google Trends unavailable for '%s' — using synthetic seasonal proxy", keyword
    )
    return _synthetic_fallback(start_date, end_date)
