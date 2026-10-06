const WEATHER_API = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";
const RADAR_API = "https://api.rainviewer.com/public/weather-maps.json";

const DEFAULT_LOCATION = {
    name: "Banjarbaru",
    country: "Indonesia",
    latitude: -3.4406,
    longitude: 114.8365,
    timezone: "Asia/Makassar"
};

const elements = {
    appStatus: document.querySelector("#app-status"),
    currentDate: document.querySelector("#current-date"),
    greeting: document.querySelector("#greeting"),
    searchForm: document.querySelector("#city-search-form"),
    searchInput: document.querySelector("#city-search"),
    cityName: document.querySelector("#city-name"),
    countryName: document.querySelector("#country-name"),
    updatedAt: document.querySelector("#updated-at"),
    temperature: document.querySelector("#temperature"),
    condition: document.querySelector("#condition"),
    feelsLike: document.querySelector("#feels-like"),
    weatherIcon: document.querySelector("#weather-icon"),
    humidity: document.querySelector("#humidity"),
    windSpeed: document.querySelector("#wind-speed"),
    uvIndex: document.querySelector("#uv-index"),
    visibility: document.querySelector("#visibility"),
    hourlyList: document.querySelector(".hourly-list"),
    weeklyList: document.querySelector("#weekly-list"),
    radarMap: document.querySelector("#radar-map"),
    radarStatus: document.querySelector("#radar-status-text"),
    footerYear: document.querySelector("#footer-year")
};

let activeWeatherRequest;
let activeSearchRequest;
let searchSequence = 0;
let currentLocation = DEFAULT_LOCATION;
let radarMap;
let radarLayer;
let locationMarker;

function setStatus(message, isError = false) {
    elements.appStatus.textContent = message;
    elements.appStatus.classList.toggle("is-error", isError);
}

async function fetchJson(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) {
        throw new Error(`Permintaan data gagal (HTTP ${response.status}).`);
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.reason || "Penyedia data cuaca menolak permintaan.");
    }
    return data;
}

function weatherDescription(code) {
    const descriptions = {
        0: ["Cerah", "ph-sun", "sunny"],
        1: ["Sebagian besar cerah", "ph-cloud-sun", "partly"],
        2: ["Cerah berawan", "ph-cloud-sun", "partly"],
        3: ["Mendung", "ph-cloud", "cloudy"],
        45: ["Berkabut", "ph-cloud-fog", "foggy"],
        48: ["Kabut beku", "ph-cloud-fog", "foggy"],
        51: ["Gerimis ringan", "ph-cloud-rain", "rainy"],
        53: ["Gerimis", "ph-cloud-rain", "rainy"],
        55: ["Gerimis lebat", "ph-cloud-rain", "rainy"],
        56: ["Gerimis beku ringan", "ph-cloud-snow", "snowy"],
        57: ["Gerimis beku lebat", "ph-cloud-snow", "snowy"],
        61: ["Hujan ringan", "ph-cloud-rain", "rainy"],
        63: ["Hujan sedang", "ph-cloud-rain", "rainy"],
        65: ["Hujan lebat", "ph-cloud-rain", "rainy"],
        66: ["Hujan beku ringan", "ph-cloud-snow", "snowy"],
        67: ["Hujan beku lebat", "ph-cloud-snow", "snowy"],
        71: ["Salju ringan", "ph-cloud-snow", "snowy"],
        73: ["Salju sedang", "ph-cloud-snow", "snowy"],
        75: ["Salju lebat", "ph-cloud-snow", "snowy"],
        77: ["Butiran salju", "ph-cloud-snow", "snowy"],
        80: ["Hujan lokal ringan", "ph-cloud-rain", "rainy"],
        81: ["Hujan lokal sedang", "ph-cloud-rain", "rainy"],
        82: ["Hujan lokal lebat", "ph-cloud-rain", "rainy"],
        85: ["Hujan salju ringan", "ph-cloud-snow", "snowy"],
        86: ["Hujan salju lebat", "ph-cloud-snow", "snowy"],
        95: ["Badai petir", "ph-cloud-lightning", "stormy"],
        96: ["Badai petir dan hujan es", "ph-cloud-lightning", "stormy"],
        99: ["Badai petir dan hujan es lebat", "ph-cloud-lightning", "stormy"]
    };
    const [text, icon, kind] = descriptions[code] || [
        "Kondisi tidak diketahui",
        "ph-cloud",
        "cloudy"
    ];
    return { text, icon, kind };
}

function uvDescription(value) {
    if (!Number.isFinite(value)) return "Tidak tersedia";
    const level = value < 3
        ? "Rendah"
        : value < 6
            ? "Sedang"
            : value < 8
                ? "Tinggi"
                : value < 11
                    ? "Sangat tinggi"
                    : "Ekstrem";
    return `${value.toFixed(1)} · ${level}`;
}

function setWeatherIcon(element, code, baseClass) {
    const weather = weatherDescription(code);
    element.className = `ph-fill ${weather.icon} ${baseClass} weather-kind--${weather.kind}`;
    return weather;
}

function setCurrentWeatherIcon(element, code, isDay) {
    const weather = weatherDescription(code);
    const nightIcons = {
        0: "ph-moon",
        1: "ph-cloud-moon",
        2: "ph-cloud-moon"
    };
    const icon = isDay === 0 ? nightIcons[code] || weather.icon : weather.icon;
    element.className = `ph-fill ${icon} weather-icon weather-kind--${weather.kind}`;
}

function timezoneLabel(timezone) {
    const indonesianTimezones = {
        "Asia/Jakarta": "WIB",
        "Asia/Pontianak": "WIB",
        "Asia/Makassar": "WITA",
        "Asia/Jayapura": "WIT"
    };
    if (indonesianTimezones[timezone]) return indonesianTimezones[timezone];

    const parts = new Intl.DateTimeFormat("en", {
        timeZone: timezone,
        timeZoneName: "short"
    }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value || timezone;
}

function setLocalDate(dateTime) {
    const [year, month, day] = dateTime.split("T")[0].split("-").map(Number);
    const localCalendarDate = new Date(Date.UTC(year, month - 1, day, 12));
    elements.currentDate.textContent = new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
    }).format(localCalendarDate).toLocaleUpperCase("id-ID");
}

function setGreeting(localTime) {
    const hour = Number(localTime.slice(11, 13));
    if (hour < 11) {
        elements.greeting.textContent = "Selamat pagi";
    } else if (hour < 15) {
        elements.greeting.textContent = "Selamat siang";
    } else if (hour < 18) {
        elements.greeting.textContent = "Selamat sore";
    } else {
        elements.greeting.textContent = "Selamat malam";
    }
}

function formatTime(time) {
    return time.slice(11, 16);
}

function formatDay(date) {
    const [year, month, day] = date.split("-").map(Number);
    return new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        timeZone: "UTC"
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatShortDate(date) {
    const [, month, day] = date.split("-").map(Number);
    const shortMonth = new Intl.DateTimeFormat("id-ID", {
        month: "short",
        timeZone: "UTC"
    }).format(new Date(Date.UTC(2020, month - 1, 15)));
    return `${day} ${shortMonth}`;
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function getNextHourIndex(times, currentTime) {
    const index = times.findIndex((time) => time >= currentTime.slice(0, 13));
    return index < 0 ? 0 : index;
}

function renderHourlyForecast(hourly, currentTime) {
    const startIndex = getNextHourIndex(hourly.time, currentTime);
    const fragment = document.createDocumentFragment();
    const endIndex = Math.min(startIndex + 5, hourly.time.length);

    for (let index = startIndex; index < endIndex; index += 1) {
        const hour = createElement("div", "hour");
        const time = createElement(
            "span",
            "",
            index === startIndex ? "Sekarang" : formatTime(hourly.time[index])
        );
        const icon = createElement("i");
        setWeatherIcon(icon, hourly.weather_code[index], "hour-icon");
        icon.setAttribute("aria-hidden", "true");

        const temperature = createElement("strong", "", `${Math.round(hourly.temperature_2m[index])}°`);
        const rainChance = createElement(
            "small",
            "",
            `${hourly.precipitation_probability[index] ?? "--"}% hujan`
        );

        hour.append(time, icon, temperature, rainChance);
        fragment.append(hour);
    }

    if (fragment.childElementCount === 0) {
        throw new Error("Prakiraan per jam tidak tersedia untuk lokasi ini.");
    }
    elements.hourlyList.replaceChildren(fragment);
}

function renderWeeklyForecast(daily) {
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < daily.time.length; index += 1) {
        const row = createElement("div", "day-row");
        const dayName = createElement("strong", "", index === 0 ? "Hari ini" : formatDay(daily.time[index]));
        const date = createElement("span", "", formatShortDate(daily.time[index]));
        const icon = createElement("i");
        setWeatherIcon(icon, daily.weather_code[index], "day-icon");
        icon.setAttribute("aria-hidden", "true");
        const description = createElement("span", "day-condition", weatherDescription(daily.weather_code[index]).text);
        const rainChance = createElement(
            "span",
            "day-rain",
            `${daily.precipitation_probability_max[index] ?? "--"}%`
        );
        rainChance.setAttribute(
            "aria-label",
            `Peluang hujan ${daily.precipitation_probability_max[index] ?? "tidak tersedia"} persen`
        );
        const temperatures = createElement("strong", "day-temperatures");
        const high = createElement("span", "", `${Math.round(daily.temperature_2m_max[index])}°`);
        const low = createElement("span", "muted", `${Math.round(daily.temperature_2m_min[index])}°`);

        temperatures.append(high, low);
        row.append(dayName, date, icon, description, rainChance, temperatures);
        fragment.append(row);
    }

    elements.weeklyList.replaceChildren(fragment);
}

function findClosestHourlyValue(hourly, field, currentTime) {
    const index = getNextHourIndex(hourly.time, currentTime);
    return hourly[field][index];
}

function displayWeather(data, location) {
    const { current, current_units: units, hourly, daily, timezone } = data;
    if (!current || !hourly?.time?.length || !daily?.time?.length) {
        throw new Error("Data cuaca yang diterima tidak lengkap.");
    }

    const currentWeather = weatherDescription(current.weather_code);
    const uvIndex = findClosestHourlyValue(hourly, "uv_index", current.time);
    const visibility = findClosestHourlyValue(hourly, "visibility", current.time);

    elements.cityName.textContent = location.name;
    elements.countryName.textContent = location.admin1
        ? `${location.admin1}, ${location.country}`
        : location.country;
    elements.updatedAt.textContent = `Diperbarui ${formatTime(current.time)} · ${timezoneLabel(timezone)}`;
    elements.temperature.textContent = `${Math.round(current.temperature_2m)}°`;
    elements.condition.textContent = currentWeather.text;
    elements.feelsLike.textContent = `Terasa seperti ${Math.round(current.apparent_temperature)}°`;
    elements.humidity.textContent = `${current.relative_humidity_2m}${units.relative_humidity_2m}`;
    elements.windSpeed.textContent = `${Math.round(current.wind_speed_10m)} ${units.wind_speed_10m.replace("km/h", "km/j")}`;
    elements.uvIndex.textContent = uvDescription(uvIndex);
    elements.visibility.textContent = Number.isFinite(visibility)
        ? `${(visibility / 1000).toFixed(1)} km`
        : "Tidak tersedia";
    setCurrentWeatherIcon(elements.weatherIcon, current.weather_code, current.is_day);
    setLocalDate(current.time);
    setGreeting(current.time);
    renderHourlyForecast(hourly, current.time);
    renderWeeklyForecast(daily);
}

async function loadWeather(location) {
    activeWeatherRequest?.abort();
    activeWeatherRequest = new AbortController();
    const { signal } = activeWeatherRequest;
    document.querySelector(".main-content").setAttribute("aria-busy", "true");
    setStatus(`Memuat data cuaca untuk ${location.name}...`);

    const params = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
        hourly: "temperature_2m,precipitation_probability,weather_code,uv_index,visibility",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        timezone: "auto",
        forecast_days: "7",
        wind_speed_unit: "kmh"
    });

    try {
        const data = await fetchJson(`${WEATHER_API}?${params}`, signal);
        displayWeather(data, location);
        currentLocation = { ...location, timezone: data.timezone };
        setStatus(`Data cuaca berhasil diperbarui untuk ${location.name}.`);
        elements.searchInput.value = "";
        if (radarMap) {
            const coordinates = [location.latitude, location.longitude];
            radarMap.setView(coordinates, 6);
            locationMarker?.setLatLng(coordinates).setPopupContent(location.name);
        }
    } catch (error) {
        if (error.name === "AbortError") return;
        setStatus(`Tidak dapat memuat cuaca: ${error.message}`, true);
    } finally {
        if (activeWeatherRequest?.signal === signal) {
            document.querySelector(".main-content").removeAttribute("aria-busy");
        }
    }
}

function normalizeName(name) {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

async function searchLocation(query, signal) {
    const params = new URLSearchParams({
        name: query,
        count: "10",
        language: "id",
        format: "json"
    });
    const data = await fetchJson(`${GEOCODING_API}?${params}`, signal);
    if (!data.results?.length) {
        throw new Error(`Kota "${query}" tidak ditemukan. Coba nama kota lain.`);
    }

    const normalizedQuery = normalizeName(query);
    const results = data.results
        .filter((result) => result.country_code && Number.isFinite(result.latitude) && Number.isFinite(result.longitude))
        .sort((first, second) => {
            const firstCityRank = first.feature_code === "PPLC" || first.feature_code === "PPLA" ? 1 : 0;
            const secondCityRank = second.feature_code === "PPLC" || second.feature_code === "PPLA" ? 1 : 0;
            if (firstCityRank !== secondCityRank) return secondCityRank - firstCityRank;
            const firstExact = normalizeName(first.name) === normalizedQuery ? 1 : 0;
            const secondExact = normalizeName(second.name) === normalizedQuery ? 1 : 0;
            return secondExact - firstExact;
        });
    const result = results[0];
    if (!result) {
        throw new Error(`Koordinat untuk "${query}" tidak tersedia.`);
    }

    return {
        name: result.name,
        country: result.country,
        admin1: result.admin1,
        latitude: result.latitude,
        longitude: result.longitude,
        timezone: result.timezone
    };
}

async function handleSearch(event) {
    event.preventDefault();
    const query = elements.searchInput.value.trim();
    if (!query) {
        elements.searchInput.focus();
        setStatus("Masukkan nama kota yang ingin dicari.", true);
        return;
    }

    activeSearchRequest?.abort();
    activeSearchRequest = new AbortController();
    const requestSequence = ++searchSequence;
    const { signal } = activeSearchRequest;
    elements.searchForm.querySelector("button").disabled = true;
    setStatus(`Mencari kota "${query}"...`);
    try {
        const location = await searchLocation(query, signal);
        if (requestSequence !== searchSequence) return;
        await loadWeather(location);
    } catch (error) {
        if (error.name === "AbortError") return;
        setStatus(error.message, true);
    } finally {
        if (requestSequence === searchSequence) {
            elements.searchForm.querySelector("button").disabled = false;
        }
    }
}

function formatRadarTime(timestamp) {
    return new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: currentLocation.timezone || "UTC"
    }).format(new Date(timestamp * 1000));
}

async function refreshRadar() {
    if (!radarMap) return;

    try {
        const data = await fetchJson(RADAR_API);
        const frames = data.radar?.past;
        const latestFrame = frames?.at(-1);
        if (!data.host || !latestFrame?.path) {
            throw new Error("Frame radar terbaru belum tersedia.");
        }

        if (radarLayer) radarMap.removeLayer(radarLayer);
        radarLayer = L.tileLayer(
            `${data.host}${latestFrame.path}/256/{z}/{x}/{y}/2/1_1.png`,
            { opacity: 0.72, maxNativeZoom: 7, maxZoom: 7, attribution: "Radar © RainViewer" }
        ).addTo(radarMap);
        elements.radarStatus.textContent = `Radar aktual · ${formatRadarTime(latestFrame.time)} waktu setempat`;
        elements.radarMap.setAttribute(
            "aria-label",
            `Peta radar hujan di sekitar ${currentLocation.name}`
        );
    } catch (error) {
        elements.radarStatus.textContent = `Radar tidak tersedia: ${error.message}`;
        document.querySelector(".radar-status").classList.add("is-error");
    }
}

function initializeRadar() {
    if (!window.L) {
        elements.radarStatus.textContent = "Peta gagal dimuat. Periksa koneksi internet.";
        document.querySelector(".radar-status").classList.add("is-error");
        return;
    }

    radarMap = L.map(elements.radarMap, {
        scrollWheelZoom: false,
        zoomControl: true,
        minZoom: 3,
        maxZoom: 7
    }).setView([currentLocation.latitude, currentLocation.longitude], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 7,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(radarMap);

    locationMarker = L.circleMarker([currentLocation.latitude, currentLocation.longitude], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: "#a4d28e",
        fillOpacity: 1
    }).addTo(radarMap).bindPopup(currentLocation.name);

    refreshRadar();
    window.setInterval(refreshRadar, 10 * 60 * 1000);
}

elements.searchForm.addEventListener("submit", handleSearch);
elements.footerYear.textContent = String(new Date().getFullYear());
initializeRadar();
loadWeather(DEFAULT_LOCATION);
window.setInterval(() => loadWeather(currentLocation), 15 * 60 * 1000);
