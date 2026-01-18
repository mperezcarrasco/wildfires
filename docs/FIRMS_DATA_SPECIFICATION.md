# NASA FIRMS Data Specification - Internal Technical Documentation

## Overview

This platform queries NASA's Fire Information for Resource Management System (FIRMS) to retrieve near-real-time (NRT) thermal anomaly data from multiple satellite instruments. The data represents **thermal anomalies detected by satellite-based infrared sensors**, not verified fire events.

---

## API Endpoints

### Base URL
```
https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{BOUNDS}/{DAYS}
```

### Parameters
| Parameter | Description | Example |
|-----------|-------------|---------|
| `MAP_KEY` | API authentication key from NASA Earthdata | `abc123...` |
| `SOURCE` | Satellite/instrument identifier | `VIIRS_NOAA20_NRT` |
| `BOUNDS` | Bounding box: `west,south,east,north` | `-73.5,-38.5,-71.0,-36.0` |
| `DAYS` | Number of days of data (1-10) | `1` |

### Queried Sources

| Source ID | Satellite | Instrument | Resolution | Revisit Time |
|-----------|-----------|------------|------------|--------------|
| `VIIRS_NOAA20_NRT` | NOAA-20 (JPSS-1) | VIIRS | 375m | ~12 hours |
| `VIIRS_SNPP_NRT` | Suomi NPP | VIIRS | 375m | ~12 hours |
| `MODIS_NRT` | Terra / Aqua | MODIS | 1km | ~12 hours (each) |

---

## Satellite Instruments

### VIIRS (Visible Infrared Imaging Radiometer Suite)

**Platforms:** NOAA-20 (launched 2017), Suomi NPP (launched 2011)

**Detection Method:**
- Uses I-band 4 (I4) at 3.74 μm (mid-infrared) for fire detection
- Uses I-band 5 (I5) at 11.45 μm (thermal infrared) for background characterization
- Contextual algorithm compares potential fire pixel against neighboring pixels

**Spatial Resolution:** 375m at nadir (I-bands)

**Key Characteristics:**
- Higher spatial resolution than MODIS allows detection of smaller fires
- Sub-pixel fire detection: a 375m pixel can contain multiple small fires or partial fire coverage
- Saturation occurs at ~634K (bright_ti4) limiting characterization of intense fires

### MODIS (Moderate Resolution Imaging Spectroradiometer)

**Platforms:** Terra (launched 1999, descending ~10:30 local), Aqua (launched 2002, ascending ~13:30 local)

**Detection Method:**
- Uses Band 21/22 at 3.96 μm (mid-infrared) for fire detection
- Uses Band 31 at 11.03 μm (thermal infrared) for background
- Contextual algorithm with absolute and relative thresholds

**Spatial Resolution:** 1km at nadir

**Key Characteristics:**
- Longer data record (since 2000) for historical analysis
- Lower resolution means smaller fires may be missed
- Two satellites provide 4 daily observations at equator

---

## Data Fields Specification

### Common Fields (All Sources)

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `latitude` | float | degrees | WGS84 latitude of pixel center |
| `longitude` | float | degrees | WGS84 longitude of pixel center |
| `acq_date` | string | YYYY-MM-DD | Acquisition date (UTC) |
| `acq_time` | string | HHMM | Acquisition time (UTC), e.g., "0438" = 04:38 UTC |
| `satellite` | string | - | Satellite identifier (N20, N, Terra, Aqua) |
| `instrument` | string | - | VIIRS or MODIS |
| `confidence` | varies | - | Detection confidence (see below) |
| `frp` | float | MW | Fire Radiative Power |
| `daynight` | char | - | D = day, N = night |
| `version` | string | - | Algorithm version (e.g., "2.0NRT", "6.1NRT") |

### VIIRS-Specific Fields

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `bright_ti4` | float | Kelvin | I4 channel brightness temperature (3.74 μm) |
| `bright_ti5` | float | Kelvin | I5 channel brightness temperature (11.45 μm) |
| `scan` | float | km | Scan pixel size (cross-track) |
| `track` | float | km | Track pixel size (along-track) |

### MODIS-Specific Fields

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `brightness` | float | Kelvin | Band 21/22 brightness temperature (3.96 μm) |
| `bright_t31` | float | Kelvin | Band 31 brightness temperature (11.03 μm) |
| `scan` | float | km | Scan pixel size |
| `track` | float | km | Track pixel size |

---

## Confidence Levels

### VIIRS Confidence (Categorical)

| Value | Label | Criteria |
|-------|-------|----------|
| `l` | Low | Daytime pixels with sun glint OR temperature anomaly < 15K above background |
| `n` | Nominal | Temperature anomaly ≥ 15K above background, no sun glint, no saturation |
| `h` | High | Pixel is saturated in I4 band (bright_ti4 approaches ~367°C / 640K) |

**Note:** "High" confidence indicates sensor saturation due to intense heat, not necessarily higher detection accuracy.

### MODIS Confidence (Numeric: 0-100)

| Range | Interpretation |
|-------|----------------|
| 0-30 | Low confidence - potential false positive |
| 30-80 | Nominal confidence |
| 80-100 | High confidence - strong thermal signature |

**Calculation:** Based on multiple factors including:
- Background temperature variability
- Fire pixel temperature
- Number of adjacent fire pixels
- Sun glint probability
- Cloud adjacency

---

## Fire Radiative Power (FRP)

### Definition
FRP measures the radiant energy release rate from a fire, proportional to biomass combustion rate.

### Formula (simplified)
```
FRP = A × σ × ε × (T_fire^4 - T_bg^4)
```
Where:
- A = pixel area
- σ = Stefan-Boltzmann constant
- ε = emissivity
- T_fire = fire temperature
- T_bg = background temperature

### Interpretation

| FRP (MW) | Typical Source |
|----------|----------------|
| 0-5 | Small/smoldering fire, agricultural burn |
| 5-20 | Moderate grass/shrub fire |
| 20-50 | Active forest fire |
| 50-100 | Intense crown fire |
| >100 | Extreme fire behavior |

### Limitations
- **Saturation:** VIIRS I4 band saturates at ~634K, MODIS at ~500K. Intense fires may have underestimated FRP.
- **Sub-pixel fires:** FRP is integrated over the entire pixel; actual fire may be much smaller.
- **Atmospheric effects:** Smoke and aerosols can attenuate signal.
- **View angle:** Off-nadir observations have larger pixels and different atmospheric path lengths.

---

## Detection Algorithm Overview

### VIIRS VNP14IMG Algorithm (v2.0)

1. **Cloud Masking:** Pixels identified as cloudy are excluded
2. **Water Masking:** Water bodies excluded using land/water mask
3. **Potential Fire Test:**
   - I4 brightness temp > dynamic threshold (typically ~310K day, ~295K night)
4. **Contextual Test:**
   - Compare pixel to valid neighboring background pixels
   - Fire pixel must exceed background mean + N × standard deviation
5. **False Alarm Rejection:**
   - Sun glint check (daytime coastal/water adjacent)
   - Desert boundary false alarm check
   - Sensor noise rejection

### MODIS MOD14/MYD14 Algorithm (v6.1)

Similar contextual approach with:
- Absolute threshold tests
- Contextual tests against background window
- Cloud shadow and sun glint rejection
- Coastal false alarm mitigation

---

## Data Processing Pipeline (This Application)

### 1. API Query
```python
sources = ['VIIRS_NOAA20_NRT', 'VIIRS_SNPP_NRT', 'MODIS_NRT']
bounds = "-73.5,-38.5,-71.0,-36.0"  # VIII Region, Chile
days = 1
```

### 2. Geographic Filtering
Data is pre-filtered by API using bounding box, but we apply secondary validation:
```python
REGION_BOUNDS = {
    'north': -36.0,
    'south': -38.5,
    'west': -73.5,
    'east': -71.0
}
```

### 3. Confidence Filtering
```python
# VIIRS: Accept 'n' (nominal) and 'h' (high)
# MODIS: Accept confidence >= 50
```

Rationale: Low confidence detections have higher false positive rates from sun glint, cloud edges, and warm surfaces.

### 4. Duplicate Removal
Detections from multiple satellites at similar locations are deduplicated:
```python
key = (round(latitude, 4), round(longitude, 4))  # ~11m precision
```

### 5. Time Conversion
```python
# acq_time "0438" -> "04:38" UTC -> "01:38" Chile (UTC-3)
```

---

## Known Limitations & False Positives

### Common False Positive Sources
1. **Sun glint** - Specular reflection from water/roofs (daytime, low confidence)
2. **Hot industrial sites** - Refineries, smelters, power plants
3. **Volcanic activity** - Persistent thermal anomalies
4. **Gas flares** - Oil/gas extraction sites
5. **Desert surfaces** - Hot bare soil in afternoon
6. **Cloud edges** - Warm cloud boundaries misclassified

### Detection Gaps
1. **Cloud cover** - No detection possible through thick clouds
2. **Small/cool fires** - Below detection threshold
3. **Rapid fires** - May occur between satellite overpasses
4. **Canopy fires** - Dense canopy can obscure surface fire

### Temporal Considerations
- **NRT Latency:** Data available ~3 hours after satellite overpass
- **Revisit Gap:** Up to 12 hours between observations from same satellite
- **Combined Coverage:** With all 3 sources, typical gap is 4-6 hours

---

## References

1. Schroeder, W., et al. (2014). The New VIIRS 375m active fire detection data product. *Remote Sensing of Environment*, 143, 85-96.

2. Giglio, L., et al. (2016). Active fire detection and characterization with the Advanced Spaceborne Thermal Emission and Reflection Radiometer (ASTER). *Remote Sensing of Environment*, 178, 31-41.

3. NASA FIRMS Documentation: https://firms.modaps.eosdis.nasa.gov/descriptions/

4. VIIRS Active Fire User Guide: https://viirsland.gsfc.nasa.gov/PDF/VIIRS_activefire_User_Guide.pdf

---

## Appendix: Sample API Response

### VIIRS Response
```csv
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
-37.88564,-72.67286,318.75,0.74,0.76,2026-01-18,438,N20,VIIRS,n,2.0NRT,286.58,3.44,N
```

### MODIS Response
```csv
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-37.87871,-72.42358,339.36,1.35,1.15,2026-01-18,200,Terra,MODIS,100,6.1NRT,294.02,66.14,N
```

---

*Document Version: 1.0*
*Last Updated: 2026-01-18*
