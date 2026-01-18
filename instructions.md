Perfect! Let's create a clear set of instructions for Claude Code to build this platform. I'll structure this for rapid deployment.

## Instructions for Claude Code

Create a web platform to visualize active wildfires in Chile's VIII Region (Biobío) using NASA FIRMS data with real-time updates.

### Project Requirements

**Tech Stack:**
- Backend: Python with Flask
- Frontend: HTML/CSS/JavaScript with Leaflet.js and Leaflet.heat plugin
- Data Source: NASA FIRMS API (VIIRS/MODIS)
- Auto-refresh: Every 10 minutes

**Geographic Focus:**
- VIII Region (Biobío), Chile
- Approximate bounds: 
  - North: -36.0°
  - South: -38.5°
  - West: -73.5°
  - East: -71.0°

### Core Features

1. **Backend (app.py):**
   - Flask application serving the web interface
   - API endpoint `/api/fires` that fetches data from FIRMS
   - Filter fires by:
     - Geographic bounds (VIII Region)
     - Confidence level (only 'nominal' and 'high')
     - Time window (last 24 hours)
   - Return JSON with: latitude, longitude, FRP (fire radiative power), acquisition time, confidence
   - Environment variable for MAP_KEY (use python-dotenv)

2. **FIRMS API Integration:**
   - Endpoint: `https://firms.modaps.eosdis.nasa.gov/api/country/csv/{MAP_KEY}/VIIRS_NOAA20_NRT/CHL/1`
   - Also fetch MODIS data: `https://firms.modaps.eosdis.nasa.gov/api/country/csv/{MAP_KEY}/MODIS_NRT/CHL/1`
   - Combine both datasets
   - Parse CSV response and filter for VIII Region coordinates

3. **Frontend (templates/index.html):**
   - Full-screen Leaflet map centered on VIII Region
   - Base layer: OpenStreetMap
   - Heatmap layer using Leaflet.heat showing fire intensity
   - Heat intensity based on FRP values
   - Info panel showing:
     - Total active fires detected
     - Last update timestamp
     - Next refresh countdown
     - Legend for heat intensity
   - Auto-refresh every 10 minutes (600,000ms) using JavaScript setInterval

4. **Visualization:**
   - Heatmap gradient: blue → cyan → lime → yellow → red (low to high FRP)
   - Radius: scale based on FRP value (larger for higher FRP)
   - Blur: 15-20 for smooth visualization
   - Optional: Add markers for high-intensity fires (FRP > 50 MW) with popups showing details

### File Structure
```
wildfire-platform/
├── app.py                 # Flask backend
├── .env                   # Environment variables (MAP_KEY)
├── requirements.txt       # Python dependencies
├── templates/
│   └── index.html        # Main visualization page
├── static/
│   ├── css/
│   │   └── style.css     # Custom styling
│   └── js/
│       └── map.js        # Map initialization and update logic
└── README.md             # Setup instructions
```

### Implementation Steps

1. **Create project structure** with all directories and files

2. **requirements.txt should include:**
   ```
   Flask==3.0.0
   requests==2.31.0
   python-dotenv==1.0.0
   gunicorn==21.2.0
   ```

3. **Environment setup:**
   - Create .env file template with `MAP_KEY=your_key_here`
   - Add .env to .gitignore

4. **Backend logic (app.py):**
   - Load MAP_KEY from environment
   - Create `/api/fires` endpoint that:
     - Fetches VIIRS and MODIS data
     - Parses CSV (columns: latitude, longitude, brightness, scan, track, acq_date, acq_time, satellite, confidence, frp, daynight)
     - Filters for VIII Region bounds
     - Filters for confidence in ['n', 'h'] (nominal, high)
     - Combines datasets and removes duplicates
     - Returns JSON array of fire points
   - Serve index.html at root route

5. **Frontend (index.html):**
   - Include Leaflet CSS/JS (v1.9.4)
   - Include Leaflet.heat plugin
   - Create full-screen map div
   - Initialize map centered at -37.5, -72.5 (approximate center of VIII Region)
   - Create info panel overlay with fire count and last update
   - Implement `updateHeatmap()` function that:
     - Fetches from `/api/fires`
     - Converts fire data to heatmap format [lat, lng, intensity]
     - Updates heat layer
     - Updates info panel
   - Call `updateHeatmap()` on page load and every 10 minutes

6. **Styling (static/css/style.css):**
   - Full-screen map (height: 100vh)
   - Info panel: positioned top-right, semi-transparent background
   - Responsive design for mobile

7. **Create README.md** with:
   - Setup instructions
   - How to add MAP_KEY
   - How to run locally: `python app.py`
   - Deployment suggestions (Render, Heroku, or Railway)

### Additional Requirements

- Add error handling for API failures (show message to user)
- Add loading spinner during data fetch
- Log API calls with timestamps to console
- Add fallback if FIRMS API is down (show last cached data)
- Include timestamp of each fire detection in popup (if adding markers)

### Testing Checklist

- [ ] Map loads and centers on VIII Region
- [ ] Fires appear as heatmap
- [ ] Auto-refresh works every 10 minutes
- [ ] Info panel updates correctly
- [ ] Works on mobile devices
- [ ] Error messages display if API fails

### Deployment Ready

Make it deployment-ready with:
- Gunicorn configuration
- Port configuration from environment (default 5000)
- Production-ready error handling

---

**Start by creating the complete project structure, then implement each component. Prioritize getting a working prototype, then refine the visualization.**

Manuel, once Claude Code creates this, you can:
1. Add your MAP_KEY to the .env file
2. Run `pip install -r requirements.txt`
3. Run `python app.py`
4. Open browser to `http://localhost:5000`

The platform will be ready to deploy immediately to Render, Railway, or Heroku for public access. Would you like me to also prepare deployment configuration files?