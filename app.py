import math
import urllib.request
import urllib.error
import json
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

# Preset Store Locations (User's specific Mitra10 Telukjambe Timur store settings)
STORES = {
    "Store A": {
        "name": "10052‑MITRA10 TELUKJAMBE TIMUR",
        "lat": -6.311557397425486,
        "lng": 107.27259988755473,
        "address": "Jalan Interchange Karawang Barat, Wadas, Telukjambe Timur, Karawang 41361"
    }
}

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Fallback Haversine calculation for straight-line distance
    """
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 6371.0
    return c * r

def get_road_route(lat1, lon1, lat2, lon2):
    """
    Fetch driving distance and route geometry from Open Source Routing Machine (OSRM) API.
    Note: OSRM expects longitude,latitude format.
    """
    url = f"http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson"
    try:
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'JarakKilometerApp/1.0 (mryan@gemini.com)'}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            res_data = json.loads(response.read().decode())
            if res_data.get("code") == "Ok" and len(res_data.get("routes", [])) > 0:
                route = res_data["routes"][0]
                distance_km = route["distance"] / 1000.0
                duration_seconds = route["duration"]
                geometry = route["geometry"] # GeoJSON LineString coordinates
                return distance_km, duration_seconds, geometry, False
    except Exception as e:
        print(f"OSRM road routing error: {e}. Falling back to Haversine straight-line distance.")
    
    # Fallback to straight-line
    distance_km = haversine_distance(lat1, lon1, lat2, lon2)
    # Estimate duration: average 50 km/h driving speed
    duration_seconds = (distance_km / 50.0) * 3600.0
    geometry = {
        "type": "LineString",
        "coordinates": [[lon1, lat1], [lon2, lat2]]
    }
    return distance_km, duration_seconds, geometry, True

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/calculate', methods=['POST'])
def calculate():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    # Get store location (either from presets or custom coordinates)
    store_id = data.get("store_id")
    custom_store_lat = data.get("custom_store_lat")
    custom_store_lng = data.get("custom_store_lng")

    if store_id in STORES:
        store_lat = STORES[store_id]["lat"]
        store_lng = STORES[store_id]["lng"]
        store_name = STORES[store_id]["name"]
    elif custom_store_lat is not None and custom_store_lng is not None:
        try:
            store_lat = float(custom_store_lat)
            store_lng = float(custom_store_lng)
            store_name = "Custom Store"
        except ValueError:
            return jsonify({"error": "Invalid custom store coordinates"}), 400
    else:
        return jsonify({"error": "Invalid or missing store configuration"}), 400

    # Get destination coordinates
    dest_lat = data.get("dest_lat")
    dest_lng = data.get("dest_lng")

    if dest_lat is None or dest_lng is None:
        return jsonify({"error": "Missing destination coordinates"}), 400

    try:
        dest_lat = float(dest_lat)
        dest_lng = float(dest_lng)
    except ValueError:
        return jsonify({"error": "Invalid destination coordinates"}), 400

    # Fetch road distance and route geometry from OSRM
    distance_km, duration_seconds, route_geom, is_fallback = get_road_route(
        store_lat, store_lng, dest_lat, dest_lng
    )

    # Travel durations
    # Driving: OSRM duration, or fallback 50 km/h driving speed
    driving_hours = duration_seconds / 3600.0
    # Cycling: 15 km/h
    cycling_hours = distance_km / 15.0
    # Walking: 5 km/h
    walking_hours = distance_km / 5.0

    def format_time(hours):
        total_minutes = int(hours * 60)
        if total_minutes < 1:
            return "Kurang dari 1 menit"
        if total_minutes < 60:
            return f"{total_minutes} menit"
        h = total_minutes // 60
        m = total_minutes % 60
        return f"{h} jam {m} menit"

    return jsonify({
        "success": True,
        "store": {
            "name": store_name,
            "lat": store_lat,
            "lng": store_lng
        },
        "destination": {
            "lat": dest_lat,
            "lng": dest_lng
        },
        "distance_km": round(distance_km, 3),
        "distance_m": round(distance_km * 1000, 1),
        "travel_time": {
            "walking": format_time(walking_hours),
            "cycling": format_time(cycling_hours),
            "driving": format_time(driving_hours)
        },
        "route_geometry": route_geom,
        "is_fallback": is_fallback
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
