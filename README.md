# Wildfire Visualization Platform - VIII Region, Chile

Real-time visualization of active wildfires in Chile's VIII Region (Biobío) using NASA FIRMS satellite data.

## Features

- Real-time fire detection using NASA FIRMS (VIIRS and MODIS satellites)
- Interactive heatmap visualization showing fire intensity
- Auto-refresh every 10 minutes
- High-intensity fire markers with detailed popups
- Responsive design for desktop and mobile

## Prerequisites

- Python 3.8+
- NASA FIRMS API Key (get one at https://firms.modaps.eosdis.nasa.gov/api/area/)

## Setup

1. Clone or download this repository

2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure your MAP_KEY:
   - Edit the `.env` file
   - Replace `your_key_here` with your NASA FIRMS API key

5. Run the application:
   ```bash
   python app.py
   ```

6. Open your browser to `http://localhost:5000`

## Project Structure

```
wildfires/
├── app.py                 # Flask backend
├── .env                   # Environment variables (MAP_KEY)
├── .gitignore            # Git ignore file
├── requirements.txt       # Python dependencies
├── templates/
│   └── index.html        # Main visualization page
├── static/
│   ├── css/
│   │   └── style.css     # Custom styling
│   └── js/
│       └── map.js        # Map initialization and update logic
└── README.md             # This file
```

## Deployment

### Using Gunicorn (Production)

```bash
gunicorn app:app --bind 0.0.0.0:$PORT
```

### Deploy to Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `gunicorn app:app`
5. Add environment variable: `MAP_KEY=your_key_here`

### Deploy to Railway

1. Create new project from GitHub
2. Add environment variable: `MAP_KEY=your_key_here`
3. Railway will auto-detect Python and deploy

### Deploy to Heroku

1. Create a `Procfile` with: `web: gunicorn app:app`
2. Deploy via Heroku CLI or GitHub integration
3. Set config var: `heroku config:set MAP_KEY=your_key_here`

## Data Sources

- **VIIRS** (Visible Infrared Imaging Radiometer Suite) - NOAA-20 satellite
- **MODIS** (Moderate Resolution Imaging Spectroradiometer) - Terra/Aqua satellites

Data is filtered for:
- Geographic bounds: VIII Region (Biobío)
- Confidence level: Nominal and High only
- Time window: Last 24 hours

## License

MIT License
