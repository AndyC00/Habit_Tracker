import { useEffect, useMemo, useState } from "react";
import { describeWeatherCode } from "../lib/weather";

export type TempStatus = "idle" | "loading" | "error" | "unsupported";

export function useAmbientInfo() {
  const [now, setNow] = useState<Date>(new Date());
  const [localTempC, setLocalTempC] = useState<number | null>(null);
  const [localWeather, setLocalWeather] = useState<string | null>(null);
  const [tempStatus, setTempStatus] = useState<TempStatus>("loading");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let lastCoords: { lat: number; lon: number } | null = null;
    let hasFetchedTemp = false;
    let geoPermission: PermissionStatus | null = null;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setTempStatus("unsupported");
      setLocalWeather(null);
      return;
    }

    async function fetchTemperature(lat: number, lon: number, showLoading: boolean) {
      if (showLoading) {
        setTempStatus("loading");
      }
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`,
        );
        const data = await res.json();
        if (cancelled) return;

        const temp = data?.current_weather?.temperature;
        const weatherCode = data?.current_weather?.weathercode;
        if (typeof temp === "number") {
          hasFetchedTemp = true;
          setLocalTempC(temp);
          if (typeof weatherCode === "number") {
            setLocalWeather(describeWeatherCode(weatherCode));
          } else {
            setLocalWeather(null);
          }
          setTempStatus("idle");
        } else {
          throw new Error("Missing temperature");
        }
      } catch (e) {
        if (!cancelled) {
          setLocalWeather(null);
          setTempStatus("error");
        }
      }
    }

    const requestTemperature = (showLoading: boolean) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const coords = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          };
          lastCoords = coords;
          fetchTemperature(coords.lat, coords.lon, showLoading);
        },
        () => {
          if (!cancelled) {
            setLocalWeather(null);
            setTempStatus("error");
          }
        },
        { enableHighAccuracy: false, timeout: 7000, maximumAge: 15 * 60 * 1000 },
      );
    };

    async function ensurePermissionAndFetch() {
      const permissions = (navigator as any).permissions;
      if (!permissions?.query) {
        requestTemperature(true);
        return;
      }
      try {
        const perm: PermissionStatus = await permissions.query({ name: "geolocation" });
        geoPermission = perm;
        if (perm.state === "granted" || perm.state === "prompt") {
          requestTemperature(true);
        }
        perm.onchange = () => {
          if (cancelled) return;
          if (perm.state === "granted") {
            requestTemperature(true);
          }
        };
      } catch {
        requestTemperature(true);
      }
    }

    ensurePermissionAndFetch();

    const refreshId = window.setInterval(() => {
      if (lastCoords) {
        fetchTemperature(lastCoords.lat, lastCoords.lon, !hasFetchedTemp);
      } else {
        requestTemperature(!hasFetchedTemp);
      }
    }, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(refreshId);
      if (geoPermission) {
        geoPermission.onchange = null;
      }
    };
  }, []);

  const timeString = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZoneName: "short",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }).format(now),
    [now],
  );

  const temperatureLabel = useMemo(() => {
    if (localTempC !== null) {
      return `Local ${Math.round(localTempC)}\u00b0C`;
    }
    if (tempStatus === "unsupported") return "Local temp unavailable";
    if (tempStatus === "error") return "Temperature unavailable";
    return "Loading local temp...";
  }, [localTempC, tempStatus]);

  const weatherLabel = useMemo(() => {
    if (localWeather) return localWeather;
    if (tempStatus === "unsupported") return "Local weather unavailable";
    if (tempStatus === "error") return "Weather unavailable";
    if (tempStatus === "idle") return "Weather unavailable";
    return "Loading local weather...";
  }, [localWeather, tempStatus]);

  return {
    now,
    timeString,
    localTempC,
    localWeather,
    tempStatus,
    temperatureLabel,
    weatherLabel,
  };
}
