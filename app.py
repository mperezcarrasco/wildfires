import os
import io
import csv
import logging
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request
from dotenv import load_dotenv
import requests

load_dotenv()

app = Flask(__name__)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAP_KEY = os.getenv('MAP_KEY')

# VIII Region (Biobío) + IX Region (Araucanía) bounds
REGION_BOUNDS = {
    'north': -36.0,
    'south': -39.6,
    'west': -73.5,
    'east': -71.0
}

# Cache for fallback data
fire_cache = {
    'data': [],
    'timestamp': None
}

# Chile timezone offset (UTC-3 in summer, UTC-4 in winter)
# January is summer in Chile, so UTC-3
CHILE_UTC_OFFSET = -3


def format_acq_time(acq_time_str):
    """Convert HHMM format to HH:MM string."""
    try:
        acq_time_str = str(acq_time_str).zfill(4)  # Pad with zeros (e.g., 438 -> 0438)
        hours = int(acq_time_str[:2])
        minutes = int(acq_time_str[2:])
        return f"{hours:02d}:{minutes:02d}"
    except (ValueError, IndexError):
        return acq_time_str


def create_datetime_utc(acq_date, acq_time_str):
    """Create a UTC datetime from acquisition date and time."""
    try:
        acq_time_str = str(acq_time_str).zfill(4)
        hours = int(acq_time_str[:2])
        minutes = int(acq_time_str[2:])
        dt = datetime.strptime(acq_date, '%Y-%m-%d')
        dt = dt.replace(hour=hours, minute=minutes)
        return dt
    except (ValueError, IndexError):
        return None


def utc_to_chile(dt_utc):
    """Convert UTC datetime to Chile time."""
    if dt_utc is None:
        return None
    return dt_utc + timedelta(hours=CHILE_UTC_OFFSET)


def fetch_firms_data(source, days=1):
    """Fetch fire data from NASA FIRMS API."""
    # Use area endpoint with bounding box: west,south,east,north
    # Days parameter: 1-10 days of data
    days = max(1, min(10, days))  # Clamp to valid range
    bounds = f"{REGION_BOUNDS['west']},{REGION_BOUNDS['south']},{REGION_BOUNDS['east']},{REGION_BOUNDS['north']}"
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{source}/{bounds}/{days}"
    logger.info(f"[{datetime.now().isoformat()}] Fetching {days} day(s) of data from FIRMS: {source}")

    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        logger.error(f"Error fetching {source} data: {e}")
        return None


def parse_csv_data(csv_text):
    """Parse CSV data and filter for VIII Region."""
    fires = []

    if not csv_text:
        return fires

    reader = csv.DictReader(io.StringIO(csv_text))

    for row in reader:
        try:
            lat = float(row.get('latitude', 0))
            lon = float(row.get('longitude', 0))

            # Filter by geographic bounds (VIII Region)
            if not (REGION_BOUNDS['south'] <= lat <= REGION_BOUNDS['north'] and
                    REGION_BOUNDS['west'] <= lon <= REGION_BOUNDS['east']):
                continue

            # Filter by confidence level (nominal or high)
            # VIIRS uses letters: 'n' (nominal), 'h' (high), 'l' (low)
            # MODIS uses numbers: 0-100 (we accept >= 50)
            confidence_raw = row.get('confidence', '')
            try:
                confidence_num = int(confidence_raw)
                if confidence_num < 50:
                    continue
                confidence = 'h' if confidence_num >= 80 else 'n'
            except ValueError:
                confidence = confidence_raw.lower()
                if confidence not in ['n', 'h', 'nominal', 'high']:
                    continue

            frp = float(row.get('frp', 0))
            acq_date = row.get('acq_date', '')
            acq_time_raw = row.get('acq_time', '')
            satellite = row.get('satellite', '')
            daynight = row.get('daynight', '')

            # Create formatted time strings
            acq_time_formatted = format_acq_time(acq_time_raw)
            dt_utc = create_datetime_utc(acq_date, acq_time_raw)
            dt_chile = utc_to_chile(dt_utc)

            # Calculate Unix timestamp and hours ago for filtering
            timestamp_utc = dt_utc.timestamp() if dt_utc else 0
            now = datetime.utcnow()
            hours_ago = (now - dt_utc).total_seconds() / 3600 if dt_utc else 0

            fires.append({
                'latitude': lat,
                'longitude': lon,
                'frp': frp,
                'acq_date': acq_date,
                'acq_time_utc': acq_time_formatted,
                'acq_time_chile': dt_chile.strftime('%H:%M') if dt_chile else acq_time_formatted,
                'acq_datetime_chile': dt_chile.strftime('%Y-%m-%d %H:%M') if dt_chile else f"{acq_date} {acq_time_formatted}",
                'timestamp_utc': timestamp_utc,
                'hours_ago': round(hours_ago, 1),
                'confidence': confidence,
                'satellite': satellite,
                'daynight': 'Día' if daynight == 'D' else 'Noche' if daynight == 'N' else daynight
            })
        except (ValueError, KeyError) as e:
            logger.warning(f"Error parsing row: {e}")
            continue

    return fires


def remove_duplicates(fires, include_time=True):
    """Remove duplicate fire detections based on coordinates and optionally time.

    When include_time=True, detections at same location but different times are kept
    (useful for temporal tracking). When False, only location is considered.
    """
    seen = set()
    unique_fires = []

    for fire in fires:
        if include_time:
            # Include timestamp to allow same location at different times
            key = (round(fire['latitude'], 4), round(fire['longitude'], 4), fire.get('timestamp_utc', 0))
        else:
            key = (round(fire['latitude'], 4), round(fire['longitude'], 4))
        if key not in seen:
            seen.add(key)
            unique_fires.append(fire)

    return unique_fires


@app.route('/')
def index():
    """Serve the main visualization page."""
    return render_template('index.html')


@app.route('/api/fires')
def get_fires():
    """API endpoint to fetch fire data.

    Query parameters:
    - days: Number of days of data to fetch (1-10, default 2)
    """
    global fire_cache

    if not MAP_KEY:
        return jsonify({
            'error': 'MAP_KEY not configured',
            'fires': [],
            'count': 0,
            'timestamp': datetime.now().isoformat()
        }), 500

    # Get days parameter (default 2 for temporal tracking)
    days = request.args.get('days', 2, type=int)
    days = max(1, min(10, days))  # Clamp to valid range

    all_fires = []

    # Fetch VIIRS NOAA-20 data
    viirs_noaa20_data = fetch_firms_data('VIIRS_NOAA20_NRT', days)
    if viirs_noaa20_data:
        all_fires.extend(parse_csv_data(viirs_noaa20_data))

    # Fetch VIIRS SNPP data
    viirs_snpp_data = fetch_firms_data('VIIRS_SNPP_NRT', days)
    if viirs_snpp_data:
        all_fires.extend(parse_csv_data(viirs_snpp_data))

    # Fetch MODIS data
    modis_data = fetch_firms_data('MODIS_NRT', days)
    if modis_data:
        all_fires.extend(parse_csv_data(modis_data))

    # Remove duplicates (keep time-based duplicates for tracking)
    unique_fires = remove_duplicates(all_fires, include_time=True)

    # Sort by timestamp (oldest first for animation)
    unique_fires.sort(key=lambda x: x.get('timestamp_utc', 0))

    timestamp = datetime.now().isoformat()

    # Update cache if we got data
    if unique_fires:
        fire_cache['data'] = unique_fires
        fire_cache['timestamp'] = timestamp
        logger.info(f"[{timestamp}] Found {len(unique_fires)} detections in Biobío/Araucanía ({days} days)")
    elif fire_cache['data']:
        # Use cached data as fallback
        logger.warning(f"[{timestamp}] Using cached data from {fire_cache['timestamp']}")
        unique_fires = fire_cache['data']
        timestamp = fire_cache['timestamp']

    # Calculate time range in data
    if unique_fires:
        oldest = min(f['hours_ago'] for f in unique_fires)
        newest = max(f['hours_ago'] for f in unique_fires)
    else:
        oldest = newest = 0

    return jsonify({
        'fires': unique_fires,
        'count': len(unique_fires),
        'timestamp': timestamp,
        'days_requested': days,
        'time_range': {
            'oldest_hours_ago': round(oldest, 1),
            'newest_hours_ago': round(newest, 1)
        },
        'cached': bool(fire_cache['data'] and not all_fires)
    })


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
