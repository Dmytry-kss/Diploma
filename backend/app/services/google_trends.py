import httpx
import logging
import pandas as pd

logger = logging.getLogger(__name__)

_BASE = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"
_WIKI_MIN_DATE = "2015-07-01"


def fetch_trends(keyword: str, start_date: str, end_date: str) -> pd.DataFrame:
    """
    Fetch Wikipedia pageviews as a proxy for search interest.
    
    Args:
        keyword: Article title (e.g., "Headphones")
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
    
    Returns:
        DataFrame with columns: date, search_interest (normalized 0-100)
    """
    empty = pd.DataFrame(columns=["date", "search_interest"])
    if not keyword:
        return empty

    # Wikipedia API has data only from 2015-07-01
    api_start = max(start_date, _WIKI_MIN_DATE)
    if api_start > end_date:
        logger.warning("Wikipedia: requested dates before %s", _WIKI_MIN_DATE)
        return empty

    article = keyword.strip().replace(" ", "_")
    wiki_start = api_start.replace("-", "")
    wiki_end = end_date.replace("-", "")
    url = f"{_BASE}/en.wikipedia/all-access/all-agents/{article}/daily/{wiki_start}/{wiki_end}"

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(url, headers={"User-Agent": "DemandForecastApp/1.0"})
            resp.raise_for_status()
        items = resp.json().get("items", [])
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            logger.warning("Wikipedia: article '%s' not found", article)
        else:
            logger.warning("Wikipedia Pageviews error: %s", exc)
        return empty
    except Exception as exc:
        logger.warning("Wikipedia Pageviews fetch failed: %s", exc)
        return empty

    if not items:
        return empty

    # Parse response
    records = [
        {
            "date": f"{i['timestamp'][:4]}-{i['timestamp'][4:6]}-{i['timestamp'][6:8]}",
            "views": float(i["views"])
        }
        for i in items
    ]
    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])

    # Fill every calendar day (API sometimes has gaps)
    full = pd.date_range(start=api_start, end=end_date, freq="D")
    df = df.set_index("date").reindex(full)
    df["views"] = df["views"].interpolate(method="linear").bfill().ffill().fillna(0.0)

    # Normalize raw view counts → 0-100 scale (same as Google Trends)
    max_v = df["views"].max()
    df["search_interest"] = (df["views"] / max_v * 100).round(2) if max_v > 0 else 0.0

    df = df.reset_index().rename(columns={"index": "date"})
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")

    logger.info("Wikipedia Pageviews: %d rows for '%s'", len(df), keyword)
    return df[["date", "search_interest"]]
