import requests

API_KEY = "your_api_key_here"
BASE_URL = "http://api.openweathermap.org/data/2.5/weather"

_cache = {}

def get_weather(city):
    if not city or not city.strip():
        raise ValueError("City name cannot be empty")

    if city in _cache:
        return _cache[city]

    url = f"{BASE_URL}?q={city}&appid={API_KEY}"
    response = requests.get(url)
    
    if response.status_code != 200:
        raise Exception(f"Failed to fetch weather data: {response.status_code}")

    data = response.json()
    _cache[city] = data
    return data
